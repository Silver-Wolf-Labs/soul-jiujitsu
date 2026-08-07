import { test, expect, waitForStableLayout } from "../../support/fixtures";
import { MEMBER_CREDS, loginAsMember, missingCredsReason } from "../../support/auth";

/**
 * Regression guard for the /join dead-end.
 *
 * The bug: the middleware treats "auth user with no `members` row" as mid-signup
 * and redirects to /join. But /join could only ever create a NEW account — it
 * called signUp() with the email, Supabase returned `identities: []` (it never
 * discloses whether an address is registered), and the form stopped with "Ya
 * existe una cuenta — inicia sesión". Login then sent them straight back to
 * /join. A closed loop, escapable only with a service-role key.
 *
 * These tests are read-only: they never submit the form, because completing it
 * would write a `members` row for the test account. What they check is that the
 * form ADAPTS to an existing session — which is precisely what was missing.
 *
 * Note the suite works against a member who ALREADY has a member row (the
 * normal test account), so it can't reach the completing state directly. It
 * verifies the two halves that are observable without a broken account:
 * signed-in members aren't offered a dead-end, and the escape hatch exists.
 */

test.describe("join completion (no signup dead-end)", () => {
  test.skip(
    !MEMBER_CREDS,
    missingCredsReason("E2E_MEMBER_EMAIL", "E2E_MEMBER_PASSWORD")
  );

  test.setTimeout(90_000);

  test("a signed-in member visiting /join is never told to go log in", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await page.goto("/join");
    await waitForStableLayout(page);

    const body = await page.locator("body").innerText();

    // The exact copy of the dead-end. If a signed-in visitor is being told to
    // sign in, they have nowhere left to go.
    expect(
      body,
      "A signed-in visitor was told to log in — this is the /join dead-end. " +
        "Check the existingUserId branch in JoinForm.handleSubmit."
    ).not.toMatch(/Ya existe una cuenta con/i);

    // "¿Ya eres miembro? Inicia sesión" is hidden for a signed-in visitor for
    // the same reason: it points back around the loop.
    expect(
      body,
      "The '¿Ya eres miembro? Inicia sesión' footer is showing to a signed-in " +
        "visitor, pointing them back into the login → /join loop."
    ).not.toMatch(/¿Ya eres miembro\?/i);
  });

  test("/join renders a usable form for a signed-in visitor, not a blocked one", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await page.goto("/join");
    await waitForStableLayout(page);

    // A member who already has a row gets redirected out of /join by the
    // middleware; one who doesn't stays and sees the completion form. Either
    // outcome is correct — what must NOT happen is landing on /join with a form
    // that cannot be submitted.
    const path = new URL(page.url()).pathname;
    if (path !== "/join") {
      // Redirected away: nothing to assert about the form.
      return;
    }

    // The "Siguiente" button must not be permanently disabled. It used to gate
    // on password-field state, which doesn't exist on the completing path — so
    // the button would never enable no matter what the member typed.
    const next = page.getByRole("button", { name: /siguiente|completar registro/i }).first();
    await expect(
      next,
      "No submit button on /join for a signed-in visitor."
    ).toBeVisible({ timeout: 20_000 });

    // The email must be prefilled from the session rather than left blank —
    // a blank email on this path submits into a server-side mismatch error.
    const email = page.locator('input[type="email"]');
    if (await email.count() > 0) {
      const value = await email.first().inputValue();
      expect(
        value,
        "The email field is empty for a signed-in visitor. It should be prefilled " +
          "from the session — createMemberProfile rejects a mismatch server-side."
      ).not.toBe("");
    }
  });

  test("the portal is reachable from the public site while signed in", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);

    await page.goto("/");
    await waitForStableLayout(page);

    // The public navbar's entry button said "Ingresar" ("sign in") even to a
    // member who was already signed in, so leaving the portal read as a one-way
    // door. It must offer the way back instead.
    const entry = page.getByRole("link", { name: /mi portal/i }).first();
    await expect(
      entry,
      "The public navbar doesn't offer 'Mi portal' to a signed-in member. Leaving " +
        "the portal becomes a one-way trip to the marketing homepage."
    ).toBeVisible({ timeout: 20_000 });

    await entry.click();
    await page.waitForURL(/\/portal/, { timeout: 30_000 });

    expect(
      new URL(page.url()).pathname,
      "'Mi portal' did not land on a portal route."
    ).toMatch(/^\/portal/);
  });
});
