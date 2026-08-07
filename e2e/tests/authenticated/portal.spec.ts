import { test, expect, waitForStableLayout } from "../../support/fixtures";
import { MEMBER_CREDS, loginAsMember, missingCredsReason } from "../../support/auth";
import { t } from "../../support/messages";

/**
 * Member portal flows. Read-only: a nightly run must not mutate a real member's
 * profile, so nothing here saves a change. What it proves is that a member can
 * sign in, see their own data, and sign out — the daily-use path.
 *
 * Skips itself when credentials are absent so the suite is committable and runs
 * green before a staging test account exists.
 */

test.describe("member portal", () => {
  test.skip(
    !MEMBER_CREDS,
    missingCredsReason("E2E_MEMBER_EMAIL", "E2E_MEMBER_PASSWORD")
  );

  // Signing in is slow (full page navigation + middleware profile query), so give
  // these tests more room than the global timeout.
  test.setTimeout(90_000);

  test("member can sign in and reach the portal", async ({ page, assertNoProblems }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    // The portal nav only renders after its own client-side auth check
    // (`PortalNav` calls getSession in an effect), so its presence proves the
    // session survived the navigation — the exact thing the login page's
    // `getSession` guard exists to protect against.
    await expect(
      page.locator("nav"),
      "Signed in but the portal nav never rendered — the session did not survive " +
        "the redirect. This is the failure mode PortalAuthGuard/PortalNav check for."
    ).toBeVisible({ timeout: 20_000 });

    assertNoProblems("member portal dashboard");
  });

  test("portal shows the member's own data", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    const body = await page.locator("body").innerText();

    // Not asserting specific values — the test account's data will change. What
    // matters is that the portal rendered *something* member-specific rather than
    // an empty shell, which is what a failed RLS-gated query looks like.
    expect(
      body.length,
      "The portal rendered almost no content. A member-scoped Supabase query " +
        "probably returned nothing — check RLS policies on members/check_ins."
    ).toBeGreaterThan(200);

    await expect(
      page.getByText(/something went wrong|application error/i),
      "The portal rendered an error boundary for a signed-in member."
    ).toHaveCount(0);
  });

  test("profile page loads for a signed-in member", async ({ page, assertNoProblems }) => {
    await loginAsMember(page, MEMBER_CREDS!);

    await page.goto("/portal/profile");
    await waitForStableLayout(page);

    expect(
      new URL(page.url()).pathname,
      "A signed-in member was bounced off /portal/profile — middleware is rejecting " +
        "a valid session."
    ).toBe("/portal/profile");

    const inputs = await page.locator("input, select, textarea").count();
    expect(
      inputs,
      "The profile page rendered no form fields — members cannot view or edit their details."
    ).toBeGreaterThan(0);

    assertNoProblems("/portal/profile");
  });

  test("sign out clears the session and blocks back-button access", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    // Name comes from the catalogue, not a literal: the portal is Spanish now, so
    // /sign out|log out/ matched nothing and this failed as "no sign-out button"
    // when the button was right there reading "Cerrar sesión". See support/messages.
    const signOut = page.getByRole("button", { name: t("portal.nav.signOut") }).first();
    await expect(signOut, "No sign-out button in the portal nav").toBeVisible({ timeout: 20_000 });
    await signOut.click();

    await page.waitForURL(/\/portal\/login|\/$/, { timeout: 30_000 });

    // The real privacy risk: pressing Back after signing out on the gym's shared
    // front-desk iPad and seeing the previous member's data from the browser
    // cache. Middleware sets no-store on /portal/* specifically to prevent this.
    await page.goto("/portal");
    await page.waitForLoadState("domcontentloaded");

    expect(
      new URL(page.url()).pathname,
      "After signing out, /portal was still reachable. On a shared device this " +
        "exposes the previous member's data."
    ).toBe("/portal/login");
  });
});
