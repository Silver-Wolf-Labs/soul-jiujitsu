import { test, expect, gotoOk } from "../../support/fixtures";
import { PUBLIC_ROUTES, PROTECTED_ROUTES } from "../../support/routes";

/**
 * The floor of the whole framework: every route renders, and every protected
 * route is actually protected.
 *
 * If anything in here fails the rest of the report is noise, so these run first
 * (alphabetically `smoke/` sorts early) and are the specs webkit also covers.
 */

test.describe("public routes render", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} (${route.path}) renders without errors`, async ({
      page,
      assertNoProblems,
    }) => {
      await gotoOk(page, route.path);

      // A route can return 200 and still render nothing but an error boundary,
      // so require real body text rather than trusting the status code.
      const body = page.locator("body");
      await expect(body).toBeVisible();
      const text = (await body.innerText()).trim();
      expect(
        text.length,
        `${route.path} returned 200 but rendered almost no text (${text.length} chars) — ` +
          `likely an error boundary or a failed data fetch.`
      ).toBeGreaterThan(50);

      if (route.expectText) {
        await expect(
          page.getByText(route.expectText, { exact: false }).first(),
          `${route.path} is missing its identifying text "${route.expectText}"`
        ).toBeVisible();
      }

      // Next renders `src/app/error.tsx` / `global-error.tsx` on a render
      // throw while still serving a 200, which is exactly the bug class a
      // status-code-only smoke test misses.
      await expect(
        page.getByText(/something went wrong|application error|unhandled runtime error/i),
        `${route.path} rendered an error boundary`
      ).toHaveCount(0);

      assertNoProblems(route.path);
    });
  }
});

test.describe("protected routes redirect anonymous visitors", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route.name} (${route.path}) redirects to ${route.redirectsTo}`, async ({ page }) => {
      // `waitUntil: "commit"` — we care about where middleware sends us, and
      // waiting for full load on a redirect chain is wasted time.
      await page.goto(route.path, { waitUntil: "domcontentloaded" });

      const finalPath = new URL(page.url()).pathname;
      expect(
        finalPath,
        `${route.path} should redirect anonymous visitors to ${route.redirectsTo} ` +
          `but landed on ${finalPath}. This is an authorization bug — check src/middleware.ts.`
      ).toBe(route.redirectsTo);
    });
  }
});

test.describe("error handling", () => {
  test("unknown route returns a 404 page, not a crash", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist-e2e", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status(), "Unknown routes should return HTTP 404").toBe(404);

    // Next's default 404 says "This page could not be found". Any custom
    // not-found page is fine too — what matters is that the user sees a real
    // page rather than a blank screen or a stack trace.
    const body = (await page.locator("body").innerText()).trim();
    expect(
      body.length,
      "The 404 page rendered no text — users see a blank screen on a bad link."
    ).toBeGreaterThan(10);
    expect(
      body,
      "The 404 page is leaking a stack trace to users."
    ).not.toMatch(/at \w+ \(.*?:\d+:\d+\)/);
  });

  test("unknown blog slug does not 500", async ({ page }) => {
    // Dynamic routes are the usual place an unhandled null from Supabase turns
    // into a 500. A missing post must be a 404, not a server error.
    const response = await page.goto("/blog/definitely-not-a-real-post-e2e", {
      waitUntil: "domcontentloaded",
    });
    const status = response?.status() ?? 0;
    expect(
      status,
      `Unknown blog slug returned ${status}. A missing post should 404, not 5xx — ` +
        `check the null-handling in src/app/blog/[slug]/page.tsx.`
    ).toBeLessThan(500);
  });

  test("unknown team slug does not 500", async ({ page }) => {
    const response = await page.goto("/team/definitely-not-a-real-coach-e2e", {
      waitUntil: "domcontentloaded",
    });
    const status = response?.status() ?? 0;
    expect(
      status,
      `Unknown team slug returned ${status}. Should 404, not 5xx.`
    ).toBeLessThan(500);
  });
});
