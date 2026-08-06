/**
 * Derive the public origin for a Route Handler request.
 *
 * Background: on AWS Amplify SSR the Next.js server runs in a Lambda behind
 * CloudFront.  The Lambda binds to `localhost:3000` internally, and Amplify
 * does not rewrite `request.url` before handing it to Next.js — it only
 * forwards the public host/protocol as `x-forwarded-*` headers.  That
 * means `new URL(request.url).origin` inside a Route Handler returns
 * `https://localhost:3000`, which is worse than useless when you paste it
 * into a redirect response.
 *
 * Preference order:
 *   1. `NEXT_PUBLIC_SITE_URL` environment variable — explicit override,
 *      useful when fronting the app with a custom domain that shouldn't
 *      depend on the underlying hosting provider's auto-generated host.
 *   2. `x-forwarded-host` + `x-forwarded-proto` — standard reverse-proxy
 *      headers, always set by Amplify's CloudFront edge.  Most flexible
 *      in multi-env deployments (no env var needed per stage).
 *   3. `new URL(request.url).origin` — defensive fallback for direct
 *      requests (local `next dev`, tests, or curl against the internal
 *      bind).  Not reached under normal production traffic.
 *
 * Middleware does NOT need this helper — `NextRequest.nextUrl` already
 * applies forwarded-header handling inside Next.js.  Use this only in
 * plain Route Handlers that receive a `Request` and need to emit a
 * redirect at the public origin.
 */
export function publicOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");

  const host = request.headers.get("x-forwarded-host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}
