/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    // ── CSP construction ────────────────────────────────────────────────
    // This sprint removes `'unsafe-eval'` from script-src (no production
    // code path uses it) and adds CloudWatch RUM's dataplane to
    // connect-src. `'unsafe-inline'` in both script- and style-src is
    // explicitly deferred to a focused P1 sprint — nonce-based CSP
    // requires refactoring inline-style usages across ~20 components.
    // The `report-uri` directive lets us collect violations in prod +
    // staging so the P1 refactor starts with real data, not guesses.
    const rumRegion = process.env.NEXT_PUBLIC_CW_RUM_REGION || "us-east-1";
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com",
      "font-src 'self'",
      [
        "connect-src 'self'",
        "https://*.supabase.co",
        // The Realtime socket needs its own entry: a CSP source expression
        // matches the scheme exactly, so the https:// host above does NOT
        // authorize wss://. Without it the portal's team feed silently loses its
        // live updates and falls back to polling, while every page load posts a
        // connect-src violation to /api/csp-report. Verified in Chromium: the
        // blocked socket fails via onerror rather than throwing, so it degrades
        // rather than crashing — but it does mean this is easy to break without
        // anyone noticing except the report endpoint.
        "wss://*.supabase.co",
        "https://api.stripe.com",
        // CloudWatch RUM: sessions ingest via the dataplane, guest
        // credentials via Cognito identity pools + STS.
        `https://dataplane.rum.${rumRegion}.amazonaws.com`,
        `https://cognito-identity.${rumRegion}.amazonaws.com`,
        `https://sts.${rumRegion}.amazonaws.com`,
      ].join(" "),
      "frame-src 'self' https://maps.google.com https://*.google.com https://js.stripe.com https://checkout.stripe.com https://billing.stripe.com",
      "frame-ancestors 'none'",
      "report-uri /api/csp-report",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
