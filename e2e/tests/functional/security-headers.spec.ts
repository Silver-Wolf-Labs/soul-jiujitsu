import { test, expect } from "../../support/fixtures";

/**
 * Security headers and cache behaviour.
 *
 * `next.config.mjs` builds the CSP as a hand-assembled string. That is exactly
 * the kind of code where a dropped directive breaks Supabase auth or the map
 * embed in production while everything looks fine locally — nothing type-checks
 * a CSP. These specs assert the header is present and still contains the
 * origins the app depends on.
 *
 * Note: when `E2E_BASE_URL` points at Amplify or CloudFront, the CDN may add or
 * rewrite headers. That is worth knowing about, so these run against whatever
 * origin is under test rather than being local-only.
 */

test.describe("security headers", () => {
  test("all expected headers are present on a page response", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status(), "Landing page did not respond successfully").toBeLessThan(400);

    const headers = response.headers();

    const expected: { name: string; matcher: RegExp; why: string }[] = [
      {
        name: "x-frame-options",
        matcher: /^DENY$/i,
        why: "prevents the gym site being framed for clickjacking",
      },
      {
        name: "x-content-type-options",
        matcher: /^nosniff$/i,
        why: "stops MIME sniffing on uploaded assets",
      },
      {
        name: "referrer-policy",
        matcher: /strict-origin-when-cross-origin/i,
        why: "keeps member URLs out of third-party referrer logs",
      },
      {
        name: "strict-transport-security",
        matcher: /max-age=\d+/i,
        why: "forces HTTPS for returning visitors",
      },
      {
        name: "permissions-policy",
        matcher: /camera=\(\)/i,
        why: "denies camera/mic/geolocation to embedded content",
      },
      {
        name: "content-security-policy",
        matcher: /default-src/i,
        why: "the main defence against injected scripts",
      },
    ];

    const missing: string[] = [];
    for (const { name, matcher, why } of expected) {
      const value = headers[name];
      if (!value || !matcher.test(value)) {
        missing.push(`${name} (${value ? `got "${value}"` : "absent"}) — ${why}`);
      }
    }

    expect(
      missing,
      `Security headers missing or wrong:\n${missing.map((m) => `  - ${m}`).join("\n")}\n` +
        `These are set in next.config.mjs headers().`
    ).toHaveLength(0);
  });

  test("CSP still allows the origins the app depends on", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"] ?? "";

    expect(csp, "No Content-Security-Policy header at all").not.toBe("");

    // Each of these is a live dependency. Dropping one from the CSP breaks a
    // specific user-facing feature, named here so a failure says what broke
    // rather than just "CSP changed".
    const required: { fragment: string; breaks: string }[] = [
      { fragment: "supabase.co", breaks: "all auth and data loading" },
      { fragment: "wss://*.supabase.co", breaks: "the portal team feed's live updates" },
      { fragment: "maps.google.com", breaks: "the location map embed" },
    ];

    const broken = required.filter((r) => !csp.includes(r.fragment));

    expect(
      broken,
      `The CSP no longer allows:\n` +
        broken.map((b) => `  - ${b.fragment} → breaks ${b.breaks}`).join("\n") +
        `\nCurrent CSP:\n  ${csp}`
    ).toHaveLength(0);
  });

  test("CSP no longer allows a third-party payment origin", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"] ?? "";

    // The payment integration was removed — the gym collects payment in person.
    // Nothing should load, frame, or connect to a payment processor, so an
    // allowance reappearing here means either the integration came back without
    // this test being updated, or a copy-paste widened the policy for nothing.
    expect(
      csp.includes("stripe.com"),
      `The CSP allows stripe.com again:\n  ${csp}\n` +
        `There is no payment integration; this only widens what the page may load.`
    ).toBe(false);
  });

  test("CSP has not regained unsafe-eval", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"] ?? "";

    // The hardening sprint deliberately removed `'unsafe-eval'` from script-src
    // (documented in next.config.mjs). A dependency upgrade that needs eval
    // would silently reintroduce it; this is the tripwire.
    //
    // `'unsafe-inline'` is knowingly still present and deferred to a dedicated
    // nonce-based-CSP sprint, so it is not asserted here.
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";

    expect(
      scriptSrc.includes("'unsafe-eval'"),
      `script-src regained 'unsafe-eval': "${scriptSrc.trim()}". ` +
        `It was deliberately removed — a dependency upgrade likely reintroduced it.`
    ).toBe(false);
  });
});

test.describe("cache behaviour", () => {
  test("portal pages are never cached", async ({ request }) => {
    // Middleware sets no-store on /portal/* so the back button after logout does
    // not show another member's data from the browser cache. That is a real
    // privacy leak on the shared front-desk iPad this app is built for.
    const response = await request.get("/portal/login", { maxRedirects: 0, failOnStatusCode: false });
    const cacheControl = response.headers()["cache-control"] ?? "";

    expect(
      cacheControl,
      `/portal/login has Cache-Control: "${cacheControl}". Portal pages must be ` +
        `no-store so a logged-out user cannot back-button into cached member data.`
    ).toMatch(/no-store/);
  });

  test("a request id is returned for support correlation", async ({ request }) => {
    // Middleware stamps `x-request-id` on every response specifically so a
    // member reporting a problem can quote it. If it disappears, support loses
    // its only way to find the matching logs.
    const response = await request.get("/");
    const requestId = response.headers()["x-request-id"];

    expect(
      requestId,
      "No x-request-id response header — support can no longer correlate a user " +
        "report to server logs. Set in src/middleware.ts."
    ).toBeTruthy();
  });
});
