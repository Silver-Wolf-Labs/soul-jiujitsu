import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifyToken, COOKIE_NAME as SA_COOKIE } from "@/lib/super-admin/auth";

/**
 * Generate or forward a request ID so every log line downstream can be
 * correlated to a specific user request. `x-internal-request-id` is
 * read by `withRequestContext()` in route handlers / server actions;
 * `x-request-id` is echoed back to the client so a user reporting an
 * issue can quote it and we can find their logs. We also accept an
 * incoming `x-request-id` from upstream (CloudFront / WAF can stamp
 * one) and forward it, preserving cross-layer correlation.
 */
function ensureRequestId(request: NextRequest): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export async function middleware(request: NextRequest) {
  const requestId = ensureRequestId(request);

  // Forward the ID to the handler via the incoming request headers the
  // Next runtime passes down. `NextResponse.next({ request })` rewrites
  // the request object passed to the downstream handler — we use that
  // to inject `x-internal-request-id` so `withRequestContext()` picks
  // it up. Also set on the outgoing response so clients see it.
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("x-internal-request-id", requestId);

  let supabaseResponse = NextResponse.next({
    request: { headers: forwardHeaders },
  });
  supabaseResponse.headers.set("x-request-id", requestId);

  const { pathname } = request.nextUrl;

  // ── Super Admin routes ──────────────────────────────────────────────────
  // Completely separate auth — env-var password, HMAC-signed cookie token.
  // No Supabase session needed.
  if (pathname.startsWith("/super-admin")) {
    // Let the login page through
    if (pathname === "/super-admin/login") {
      // If already authenticated, redirect to dashboard
      const token = request.cookies.get(SA_COOKIE)?.value;
      if (token && await verifyToken(token)) {
        const dashUrl = request.nextUrl.clone();
        dashUrl.pathname = "/super-admin";
        return NextResponse.redirect(dashUrl);
      }
      return supabaseResponse;
    }

    // All other /super-admin/* routes require valid token
    const token = request.cookies.get(SA_COOKIE)?.value;
    if (!token || !(await verifyToken(token))) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/super-admin/login";
      return NextResponse.redirect(loginUrl);
    }

    return supabaseResponse;
  }

  // ── Supabase session (needed for all non-super-admin routes) ────────────

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required by @supabase/ssr
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Stripe webhook — unauthenticated inbound POST, skip all auth
  if (pathname === "/api/webhooks/stripe") {
    return supabaseResponse;
  }

  // Protect all /admin routes except /admin/login
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const kioskCookie = request.cookies.get("kiosk_token")?.value;

    if (!user) {
      // No auth — redirect to login. If this device is ALSO in kiosk mode,
      // the block stays effective because no one can sign in past the login
      // page without admin credentials anyway.
      if (kioskCookie) {
        console.warn("[middleware] /admin blocked: kiosk_token present, no user");
      } else {
        console.warn("[middleware] /admin blocked: no authenticated user");
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }

    // Explicit role check — any authenticated user is not sufficient.
    // Requires the profiles table migration to be applied first.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("[middleware] /admin profile query failed:", profileError.message);
    }

    if (!profile?.is_admin) {
      console.warn("[middleware] /admin blocked: is_admin =", profile?.is_admin, "for user", user.id);
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }

    // Authenticated admin. If this device still holds a kiosk_token cookie
    // from a previous kiosk session, clear it on the response so the device
    // transitions cleanly back to "admin workstation" mode. Without this,
    // a newly re-authenticated admin lands in an infinite /admin ↔ /admin/login
    // loop because the kiosk_token block would keep bouncing them even after
    // successful sign-in.
    //
    // Cookies are cleared LOCALLY only — we deliberately do NOT invalidate
    // the server-side session token (that would nuke kiosk sessions on any
    // other device that still has the cookie). The next `lockKiosk()` or
    // `unlockKiosk()` will rotate/clean the DB token.
    if (kioskCookie) {
      console.info("[middleware] admin authenticated, clearing stale kiosk_token cookies on this device");
      const clearOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        maxAge: 0,
      };
      supabaseResponse.cookies.set("kiosk_token", "", clearOpts);
      supabaseResponse.cookies.set("kiosk_grace_until", "", clearOpts);
    }
  }

  // Kiosk routes: /kiosk/checkin requires a valid kiosk_token cookie.
  // Intentionally independent of admin auth — a kiosk session grants ONLY
  // access to /kiosk/checkin, nothing else in the app.
  if (pathname.startsWith("/kiosk/checkin")) {
    const kioskToken = request.cookies.get("kiosk_token")?.value;
    if (!kioskToken) {
      const kioskUrl = request.nextUrl.clone();
      kioskUrl.pathname = "/kiosk";
      return NextResponse.redirect(kioskUrl);
    }

    // Validate the token via a SECURITY DEFINER RPC rather than reading the
    // stored value directly. `site_settings` RLS hides `kiosk_session_token`
    // from both anon and authenticated callers — the RPC answers the yes/no
    // question without leaking the token.
    const { data: valid } = await supabase.rpc("verify_kiosk_token", {
      p_token: kioskToken,
    });

    if (!valid) {
      // Invalid or expired token — clear cookie and redirect to kiosk unlock.
      // Must clear with the same path the cookie was set on (unlockKiosk uses
      // path="/"), otherwise the browser keeps the old cookie and the next
      // request hits this branch again in an infinite redirect.
      const kioskUrl = request.nextUrl.clone();
      kioskUrl.pathname = "/kiosk";
      const response = NextResponse.redirect(kioskUrl);
      response.cookies.set("kiosk_token", "", { path: "/", maxAge: 0 });
      return response;
    }

    return supabaseResponse;
  }

  // Redirect authenticated ADMIN users away from login page.
  // Non-admin authenticated users must stay on /admin/login — do NOT redirect
  // them back to /admin or we create an infinite loop.
  if (pathname === "/admin/login" && user) {
    const { data: loginProfile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (loginProfile?.is_admin) {
      const adminUrl = request.nextUrl.clone();
      adminUrl.pathname = "/admin";
      return NextResponse.redirect(adminUrl);
    }
    // Authenticated but not admin — let them sit on the login page
  }

  // Protect /waiver — must be authenticated and have a member row.
  // An auth-user without a member row is mid-signup and belongs on /join,
  // not on the waiver page (the page itself also guards this).
  if (pathname === "/waiver") {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/portal/login";
      return NextResponse.redirect(loginUrl);
    }

    const { data: waiverMember } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!waiverMember) {
      const joinUrl = request.nextUrl.clone();
      joinUrl.pathname = "/join";
      return NextResponse.redirect(joinUrl);
    }
  }

  // Protect /portal/* routes (but not /portal/login or password reset flows)
  if (
    pathname.startsWith("/portal") &&
    pathname !== "/portal/login" &&
    pathname !== "/portal/forgot-password" &&
    pathname !== "/portal/reset-password"
  ) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/portal/login";
      return NextResponse.redirect(loginUrl);
    }

    // Check for member row
    const { data: member } = await supabase
      .from("members")
      .select("id, waiver_signed_at")
      .eq("user_id", user.id)
      .single();

    if (!member) {
      const joinUrl = request.nextUrl.clone();
      joinUrl.pathname = "/join";
      return NextResponse.redirect(joinUrl);
    }

    if (!member.waiver_signed_at) {
      const waiverUrl = request.nextUrl.clone();
      waiverUrl.pathname = "/waiver";
      return NextResponse.redirect(waiverUrl);
    }
  }

  // Prevent browser caching of portal pages so back button after logout
  // doesn't show stale authenticated content
  if (pathname.startsWith("/portal")) {
    supabaseResponse.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );
    supabaseResponse.headers.set("Pragma", "no-cache");
    supabaseResponse.headers.set("Expires", "0");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
