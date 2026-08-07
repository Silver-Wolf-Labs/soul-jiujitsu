import { test, expect, waitForStableLayout } from "../../support/fixtures";
import { ADMIN_CREDS, loginAsAdmin, missingCredsReason } from "../../support/auth";
import { ADMIN_ROUTES } from "../../support/routes";

/**
 * Admin panel. The single highest-value spec in the framework is the crawl
 * below: it opens all 28 admin pages as a real signed-in admin and reports every
 * one that throws.
 *
 * Why this catches things nothing else does — an admin page is a server
 * component running a Supabase query behind RLS. A migration that renames a
 * column, or a policy that stops returning rows, produces a page that builds
 * fine, type-checks fine, passes Vitest fine, and 500s the moment an admin
 * opens it. Nobody finds out until Fabrizio or Daniel clicks that tab.
 *
 * Read-only by design: no test here creates, edits, or deletes a record.
 */

test.describe("admin panel", () => {
  test.skip(!ADMIN_CREDS, missingCredsReason("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"));

  test("admin can sign in", async ({ page, assertNoProblems }) => {
    test.setTimeout(90_000);
    await loginAsAdmin(page, ADMIN_CREDS!);
    await waitForStableLayout(page);

    await expect(
      page.getByRole("link", { name: /dashboard/i }).first(),
      "Signed in as admin but the sidebar never rendered."
    ).toBeVisible({ timeout: 20_000 });

    assertNoProblems("admin dashboard");
  });

  test("every admin page loads without erroring", async ({ page }) => {
    // 28 page loads through a single signed-in session. Generous timeout: this is
    // the most valuable test in the suite and must not be cut short.
    test.setTimeout(300_000);

    await loginAsAdmin(page, ADMIN_CREDS!);

    const failures: string[] = [];

    for (const route of ADMIN_ROUTES) {
      // Collect problems per route rather than using the shared fixture, so a
      // console error is attributed to the page that produced it.
      const routeProblems: string[] = [];

      const onPageError = (err: Error) => routeProblems.push(`[pageerror] ${err.message}`);
      const onConsole = (msg: { type: () => string; text: () => string }) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        // Same RUM exemption as the shared console guard.
        if (/cognito-identity|dataplane\.rum|aws-rum/i.test(text)) return;
        routeProblems.push(`[console] ${text}`);
      };

      page.on("pageerror", onPageError);
      page.on("console", onConsole);

      try {
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        const status = response?.status() ?? 0;

        if (status >= 400) {
          failures.push(`${route} → HTTP ${status}`);
          continue;
        }

        // Bounced back to login means the session dropped mid-crawl, which is
        // itself a bug worth reporting.
        const landed = new URL(page.url()).pathname;
        if (landed === "/admin/login") {
          failures.push(`${route} → bounced to /admin/login (session lost mid-crawl)`);
          continue;
        }

        await page.waitForLoadState("networkidle").catch(() => {});

        const body = (await page.locator("body").innerText()).trim();

        // Next serves `error.tsx` with a 200, so the status code alone is not
        // enough — check for the error boundary's text.
        if (/something went wrong|application error|unhandled runtime error/i.test(body)) {
          failures.push(`${route} → rendered an error boundary`);
          continue;
        }

        if (body.length < 100) {
          failures.push(`${route} → rendered only ${body.length} chars (blank page?)`);
          continue;
        }

        if (routeProblems.length > 0) {
          failures.push(`${route} → ${routeProblems.slice(0, 3).join("; ")}`);
        }
      } catch (error) {
        failures.push(`${route} → threw: ${(error as Error).message}`);
      } finally {
        page.off("pageerror", onPageError);
        page.off("console", onConsole);
      }
    }

    expect(
      failures,
      `${failures.length} of ${ADMIN_ROUTES.length} admin pages are broken for a ` +
        `signed-in admin:\n${failures.map((f) => `    - ${f}`).join("\n")}\n\n` +
        `These are server components querying Supabase behind RLS. A renamed column ` +
        `or a changed policy breaks them without failing the build or Vitest.`
    ).toHaveLength(0);
  });

  test("members list renders its table", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsAdmin(page, ADMIN_CREDS!);

    await page.goto("/admin/members");
    await waitForStableLayout(page);

    // The members table is the most-used admin screen. An empty one on a gym with
    // members means a broken query, so require either rows or an explicit empty
    // state — never a silent blank.
    const hasTable = (await page.locator("table, [role='table']").count()) > 0;
    const hasEmptyState = await page
      .getByText(/no members|nothing here|no results|get started/i)
      .count();

    expect(
      hasTable || hasEmptyState > 0,
      "The admin members page shows neither a table nor an empty state — the " +
        "members query likely failed silently."
    ).toBe(true);
  });

  test("analytics pages render their charts", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page, ADMIN_CREDS!);

    // Recharts renders to SVG. A chart that fails to receive data renders an
    // empty container with no SVG at all — visually just whitespace, which is
    // easy to mistake for "no data yet".
    const routes = [
      "/admin/analytics",
      "/admin/analytics/attendance",
      "/admin/analytics/members",
      "/admin/analytics/instructors",
    ];

    const empty: string[] = [];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});

      const hasChart = (await page.locator("svg.recharts-surface, svg").count()) > 0;
      const hasEmptyState = (await page.getByText(/no data|not enough data/i).count()) > 0;
      const hasNumbers = /\d/.test(await page.locator("body").innerText());

      if (!hasChart && !hasEmptyState && !hasNumbers) {
        empty.push(route);
      }
    }

    expect(
      empty,
      `These analytics pages rendered no chart, no numbers, and no empty state: ` +
        `${empty.join(", ")}. Their data queries likely returned nothing.`
    ).toHaveLength(0);
  });

  test("admin session survives client-side navigation", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page, ADMIN_CREDS!);
    await waitForStableLayout(page);

    // Clicking through the sidebar exercises Next's client router, which is a
    // different code path from a hard navigation and has its own way of losing
    // the session (the `AdminSessionGuard` / middleware interaction).
    for (const label of ["Schedule", "Team", "Blog", "Settings"]) {
      const link = page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }).first();
      if ((await link.count()) === 0) continue;

      await link.click();
      await page.waitForLoadState("domcontentloaded");

      const landed = new URL(page.url()).pathname;
      expect(
        landed,
        `Clicking "${label}" in the admin sidebar landed on ${landed} — the session ` +
          `was lost during client-side navigation.`
      ).not.toBe("/admin/login");
    }
  });
});
