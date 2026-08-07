import { expect, type Page } from "@playwright/test";

/**
 * Credentials for the authenticated suites, read from the environment.
 *
 * Everything here is optional. When a credential is absent the corresponding
 * suite skips itself with a message naming the missing secret, rather than
 * failing. That is what lets this framework be committed and run nightly
 * *before* a staging test account exists, and light up automatically once the
 * secrets are added — no code change needed.
 *
 * Required GitHub secrets (see e2e/README.md):
 *   E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD  — a member with a signed waiver
 *   E2E_ADMIN_EMAIL  / E2E_ADMIN_PASSWORD   — a user with profiles.is_admin
 *   E2E_KIOSK_PIN                            — the kiosk PIN in site_settings
 */

export interface Credentials {
  email: string;
  password: string;
}

function readCreds(emailVar: string, passwordVar: string): Credentials | null {
  const email = process.env[emailVar];
  const password = process.env[passwordVar];
  if (!email || !password) return null;
  return { email, password };
}

export const MEMBER_CREDS = readCreds("E2E_MEMBER_EMAIL", "E2E_MEMBER_PASSWORD");
export const ADMIN_CREDS = readCreds("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");
export const KIOSK_PIN = process.env.E2E_KIOSK_PIN || null;

/** Message used in `test.skip()` so the report says exactly what to add. */
export function missingCredsReason(...vars: string[]): string {
  return `Skipped — set ${vars.join(" / ")} in repo secrets to enable this suite.`;
}

/**
 * Sign in through the real member login form.
 *
 * Deliberately drives the UI rather than calling Supabase's API directly: the
 * login form is itself a thing that can break (the `signInWithPassword` →
 * `getSession` → `window.location.href` sequence in
 * `src/app/portal/login/page.tsx` has real failure modes), and testing through
 * it means a broken login is caught rather than bypassed.
 *
 * Selectors: the login inputs have no `id`/`htmlFor` pairing and no test ids,
 * so we target them by `type` scoped to the form. Once `data-testid` hooks or
 * proper label associations land, these become `getByLabel`.
 */
export async function loginAsMember(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/portal/login");

  const form = page.locator("form");
  await form.locator('input[type="email"]').fill(creds.email);
  await form.locator('input[type="password"]').fill(creds.password);
  await form.getByRole("button", { name: /sign in/i }).click();

  // The page does a full `window.location.href` navigation on success, so wait
  // for the URL rather than for a network response.
  await page.waitForURL((url) => !url.pathname.startsWith("/portal/login"), {
    timeout: 30_000,
  });

  // A member without a signed waiver is bounced to /waiver by middleware, and a
  // member with no `members` row goes to /join. Both mean the test account is
  // misconfigured, so say so explicitly instead of failing later on a missing
  // element.
  const path = new URL(page.url()).pathname;
  expect(
    path,
    `Member login landed on ${path}. Expected /portal — if this is /waiver the ` +
      `test account has not signed the waiver; if /join it has no members row.`
  ).toBe("/portal");
}

/**
 * Sign in through the admin login form. Requires `profiles.is_admin = true`
 * for the account — middleware rejects any other authenticated user and leaves
 * them sitting on the login page.
 */
export async function loginAsAdmin(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/admin/login");

  const form = page.locator("form");
  await form.locator('input[type="email"]').fill(creds.email);
  await form.locator('input[type="password"]').fill(creds.password);
  await form.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"), {
    timeout: 30_000,
  }).catch(() => {
    // Swallow the timeout so the assertion below produces the useful message
    // instead of an opaque navigation timeout.
  });

  const path = new URL(page.url()).pathname;
  expect(
    path,
    `Admin login stayed on ${path}. Middleware only admits users with ` +
      `profiles.is_admin = true — check the E2E_ADMIN_EMAIL account's role.`
  ).toBe("/admin");
}

/**
 * Unlock the kiosk by typing the PIN into the on-screen pad.
 *
 * The pad submits automatically on the 4th digit (`src/app/kiosk/page.tsx`), so
 * there is no submit button to click.
 */
export async function unlockKiosk(page: Page, pin: string): Promise<void> {
  await page.goto("/kiosk");

  for (const digit of pin.split("")) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }

  await page.waitForURL("**/kiosk/checkin", { timeout: 30_000 }).catch(() => {});

  const path = new URL(page.url()).pathname;
  expect(
    path,
    `Kiosk unlock landed on ${path}. Expected /kiosk/checkin — check that ` +
      `E2E_KIOSK_PIN matches the kiosk_pin value in site_settings.`
  ).toBe("/kiosk/checkin");
}
