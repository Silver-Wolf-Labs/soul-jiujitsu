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
 *
 * The submit button is matched by `type="submit"`, not by its accessible name.
 * The portal is now Spanish (`next-intl`), so the button reads "Ingresar" — a
 * `/sign in/i` match broke here and timed out on all twelve member tests, with a
 * failure that looked like a broken login page rather than a renamed button. It
 * is the form's only submit control, so this is both stable and unambiguous, and
 * it survives the remaining i18n phases without another edit.
 */
export async function loginAsMember(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/portal/login");

  const form = page.locator("form");
  await form.locator('input[type="email"]').fill(creds.email);
  await form.locator('input[type="password"]').fill(creds.password);
  await form.locator('button[type="submit"]').click();

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
 *
 * Matched by `type="submit"` for the same reason as `loginAsMember`. Admin is
 * still English, so `/sign in/i` works today — but it is the next area slated for
 * translation, and there is no reason to leave a second copy of a break we
 * already know the shape of.
 */
export async function loginAsAdmin(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/admin/login");

  const form = page.locator("form");
  await form.locator('input[type="email"]').fill(creds.email);
  await form.locator('input[type="password"]').fill(creds.password);
  await form.locator('button[type="submit"]').click();

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
 *
 * TWO gates, not one. `unlockKiosk` in `src/lib/actions/check-ins.ts` checks the
 * `kiosk_require_admin` setting BEFORE it compares the PIN, and that setting
 * defaults to on — an unset value behaves as "true" so an operator has to
 * consciously allow unauthenticated unlock. So a correct PIN with no admin
 * session is refused with "Admin login required to unlock kiosk.", which is the
 * secure behaviour and not a bug.
 *
 * This helper used to type the PIN and nothing else, so the three unlock-flow
 * tests failed against any normally-configured gym and the failure message
 * blamed E2E_KIOSK_PIN — sending you to check a secret that was already correct.
 * Signing in as an admin first is what the real front desk does: a staff member
 * logs in, then hands the tablet over.
 *
 * `adminCreds` is optional so the caller can pass `ADMIN_CREDS` straight
 * through; when it is null we skip the login and let the PIN gate answer, which
 * keeps the helper usable if a gym has turned `kiosk_require_admin` off.
 *
 * Note the admin session does not survive this call: `kiosk_logout_admin_on_unlock`
 * also defaults to on, so the action signs the admin out as it hands the device
 * to the kiosk. That is deliberate — it is what stops the tablet from being a
 * logged-in admin console — and it is why the "kiosk session does not grant
 * access to admin" test still means something after this change.
 */
export async function unlockKiosk(
  page: Page,
  pin: string,
  adminCreds: Credentials | null = ADMIN_CREDS
): Promise<void> {
  if (adminCreds) {
    await loginAsAdmin(page, adminCreds);
  }

  await page.goto("/kiosk");

  for (const digit of pin.split("")) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }

  await page.waitForURL("**/kiosk/checkin", { timeout: 30_000 }).catch(() => {});

  // Surface the on-screen error when there is one. Without this the assertion
  // below reports only the URL, which is how "Admin login required" spent a
  // week looking like a wrong PIN.
  const path = new URL(page.url()).pathname;
  const onScreenError =
    path === "/kiosk"
      ? (await page.locator('[aria-live="polite"]').first().textContent().catch(() => null))?.trim()
      : null;

  expect(
    path,
    `Kiosk unlock landed on ${path}. Expected /kiosk/checkin.` +
      (onScreenError
        ? `\nThe kiosk said: "${onScreenError}"` +
          `\n- "Admin login required" means kiosk_require_admin is on and the admin ` +
          `login did not stick — check E2E_ADMIN_EMAIL has profiles.is_admin = true.` +
          `\n- "Incorrect PIN" means E2E_KIOSK_PIN does not match site_settings.kiosk_pin.`
        : `\nNo on-screen error was shown, so the unlock request itself likely never completed.`)
  ).toBe("/kiosk/checkin");
}
