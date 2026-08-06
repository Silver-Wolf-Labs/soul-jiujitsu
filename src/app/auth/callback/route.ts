import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicOrigin } from "@/lib/public-origin";

/**
 * Handles Supabase auth redirects — email confirmation, password recovery, etc.
 * Supabase appends ?code=<PKCE code> to the redirect URL; we exchange it for
 * a session.
 *
 * ⚠ Two separate things must be right for this to work in production:
 *
 * 1. Supabase dashboard config:
 *      Authentication → URL Configuration → Site URL
 *          = https://<your-prod-domain>
 *      Authentication → URL Configuration → Redirect URLs (allowlist)
 *          = https://<your-prod-domain>/auth/callback
 *          = https://<your-prod-domain>/portal/reset-password
 *      `emailRedirectTo` passed to `supabase.auth.signUp()` is ignored
 *      unless its origin appears on the allowlist — Supabase will silently
 *      fall back to Site URL.
 *
 * 2. The redirect origin we emit here:
 *      On AWS Amplify SSR, `new URL(request.url).origin` returns the
 *      Lambda's internal bind (`https://localhost:3000`), not the public
 *      host, because Amplify passes the real host as `x-forwarded-host`
 *      rather than rewriting `request.url`.  `publicOrigin()` reads those
 *      forwarded headers (or `NEXT_PUBLIC_SITE_URL` as an explicit
 *      override) so the user is redirected to the real domain after
 *      token exchange.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/portal";
  // Prevent open redirect — only allow relative paths on this origin
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/portal";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Called from Server Component — safe to ignore
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Confirmation failed — send to login with an error hint
  return NextResponse.redirect(
    `${origin}/portal/login?error=confirmation_failed`
  );
}
