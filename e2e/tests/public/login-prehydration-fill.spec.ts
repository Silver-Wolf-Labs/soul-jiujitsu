import { test, expect } from "../../support/fixtures";

/**
 * Regression guard: credentials filled BEFORE React hydrates must still submit.
 *
 * The bug: every login form read its values from React state
 * (`signInWithPassword({ email, password })`). A password manager — or any
 * autofill — writes straight to the DOM without firing a React change event, so
 * when it landed before hydration the state stayed "" while the inputs visibly
 * held the credentials. The submit posted `{email: "", password: ""}`, GoTrue
 * answered 400 "missing email or phone", and the catch rendered it as "Invalid
 * email or password" — blaming credentials that were perfectly correct. The
 * failure was intermittent, which is exactly what made it hard to pin down.
 *
 * The fix reads the fields off the submitted form via FormData, so the DOM is
 * the source of truth. These tests assert what actually leaves the browser:
 * they intercept the auth request and check the payload is non-empty. No real
 * credentials needed — a wrong password still proves the values were SENT.
 */

const FAKE_EMAIL = "prehydration-probe@example.com";
const FAKE_PASSWORD = "not-a-real-password-123";

/**
 * Fills a login form as early as the inputs exist — before hydration finishes —
 * then submits and returns the credential payload the browser actually sent.
 */
async function submitBeforeHydration(
  page: import("@playwright/test").Page,
  path: string,
  fields: { email?: string; password: string }
): Promise<{ email?: string; password?: string } | null> {
  let payload: { email?: string; password?: string } | null = null;

  page.on("request", (req) => {
    // Supabase auth (portal/admin) or the super-admin server action.
    if (req.url().includes("/auth/v1/token")) {
      try {
        payload = JSON.parse(req.postData() || "{}");
      } catch {
        /* non-JSON body — leave payload null so the assertion reports it */
      }
    }
  });

  // `waitUntil: "commit"` returns as soon as the response starts, so the fills
  // below race hydration on purpose — that IS the scenario under test.
  await page.goto(path, { waitUntil: "commit" });

  if (fields.email !== undefined) {
    await page.locator('input[type="email"]').fill(fields.email, { timeout: 20_000 });
  }
  await page.locator('input[type="password"]').fill(fields.password, { timeout: 20_000 });

  // Sanity check: the DOM really does hold what we typed. If this fails the
  // test setup is wrong, not the app.
  const domHasValues = await page.evaluate(() => {
    const pw = document.querySelector<HTMLInputElement>('input[type="password"]');
    return !!pw && pw.value !== "";
  });
  expect(domHasValues, "Test setup: the password input is empty in the DOM.").toBe(true);

  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(6000);

  return payload;
}

test.describe("login forms honour pre-hydration autofill", () => {
  test.setTimeout(90_000);

  test("admin login sends the credentials, not empty strings", async ({ page }) => {
    const payload = await submitBeforeHydration(page, "/admin/login", {
      email: FAKE_EMAIL,
      password: FAKE_PASSWORD,
    });

    expect(
      payload,
      "No auth request was sent from /admin/login at all."
    ).not.toBeNull();

    expect(
      payload!.email,
      "The admin login posted an empty email. A password manager filling the " +
        "form before hydration is being dropped — handleSubmit must read the " +
        "values from FormData, not from React state."
    ).toBe(FAKE_EMAIL);

    expect(
      payload!.password,
      "The admin login posted an empty password (same pre-hydration bug)."
    ).toBe(FAKE_PASSWORD);
  });

  test("portal login sends the credentials, not empty strings", async ({ page }) => {
    // This form is the most exposed of the three: its autoComplete hints
    // ("email" / "current-password") actively invite password-manager autofill.
    const payload = await submitBeforeHydration(page, "/portal/login", {
      email: FAKE_EMAIL,
      password: FAKE_PASSWORD,
    });

    expect(
      payload,
      "No auth request was sent from /portal/login at all."
    ).not.toBeNull();

    expect(
      payload!.email,
      "The portal login posted an empty email — pre-hydration autofill is " +
        "being dropped. Read the values from FormData in handleSubmit."
    ).toBe(FAKE_EMAIL);

    expect(
      payload!.password,
      "The portal login posted an empty password (same pre-hydration bug)."
    ).toBe(FAKE_PASSWORD);
  });
});
