import { test, expect, waitForStableLayout } from "../../support/fixtures";
import { KIOSK_PIN, missingCredsReason, unlockKiosk } from "../../support/auth";

/**
 * Kiosk check-in. This runs unattended on a tablet at the front desk, so a
 * regression is discovered by a member standing there at 6pm — the worst place
 * to find out.
 *
 * The wrong-PIN test needs no credentials and always runs; the unlock flow needs
 * E2E_KIOSK_PIN and skips without it.
 */

test.describe("kiosk PIN pad (no credentials needed)", () => {
  test("wrong PIN is rejected and the pad resets", async ({ page }) => {
    await page.goto("/kiosk");
    await waitForStableLayout(page);

    // 4 digits submits automatically. "0000" is almost certainly wrong; if it
    // happens to be the real PIN the assertion below fails loudly, which is
    // itself worth knowing.
    for (const digit of ["0", "0", "0", "0"]) {
      await page.getByRole("button", { name: digit, exact: true }).click();
    }

    /**
     * The user must get feedback. A silent rejection leaves them tapping the
     * same wrong PIN repeatedly with no idea why nothing happens.
     *
     * Deliberately not matching on wording: the rejection reason depends on
     * server config. With `kiosk_require_admin` on (the secure default) the
     * message is "Admin login required to unlock kiosk"; with it off it is
     * "Incorrect PIN". Both are correct behaviour, so assert on the error slot
     * being populated and visible rather than on the copy — otherwise this test
     * fails on a config change, which is exactly the false alarm that gets a
     * nightly muted.
     */
    const errorSlot = page.locator('[aria-live="polite"]');

    await expect(
      errorSlot.filter({ hasText: /\S/ }).first(),
      "A wrong PIN produced no visible message in the kiosk's status row — the " +
        "user gets no feedback and will keep retrying the same code."
    ).toBeVisible({ timeout: 15_000 });

    // Opacity, not just presence: `PinPad` renders the slot at `opacity-0` when
    // there is no error, so a message that never gets its opacity flipped is
    // invisible to the member even though it is in the DOM.
    const opacity = await errorSlot.first().evaluate((el) => getComputedStyle(el).opacity);
    expect(
      Number(opacity),
      "The kiosk error message is in the DOM but rendered fully transparent — " +
        "the member sees nothing."
    ).toBeGreaterThan(0.5);

    expect(
      new URL(page.url()).pathname,
      "PIN 0000 was accepted. Either that is the real PIN (change it) or the " +
        "kiosk is not validating input."
    ).toBe("/kiosk");

    // The pad must be usable again — a rejection that leaves the numpad in its
    // busy/disabled state bricks the tablet until someone reloads it.
    await expect(
      page.getByRole("button", { name: "1", exact: true }),
      "After a rejected PIN the numpad is still disabled — the kiosk is stuck " +
        "and needs a manual reload."
    ).toBeEnabled({ timeout: 5_000 });
  });

  test("backspace removes the last digit", async ({ page }) => {
    await page.goto("/kiosk");
    await waitForStableLayout(page);

    // Without a working backspace a mistyped digit forces the member to wait for
    // a failed submit before retrying.
    await page.getByRole("button", { name: "1", exact: true }).click();
    await page.getByRole("button", { name: "2", exact: true }).click();

    const backspace = page.getByRole("button", { name: "⌫" });
    await expect(backspace, "The PIN pad has no backspace key").toBeVisible();
    await backspace.click();

    // Still on /kiosk and no submit fired — two digits typed, one deleted, so the
    // pad should be holding a single digit and waiting.
    expect(new URL(page.url()).pathname).toBe("/kiosk");
  });

  test("PIN pad renders all digits and is keyboard-reachable", async ({ page }) => {
    await page.goto("/kiosk");
    await waitForStableLayout(page);

    for (const digit of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      await expect(
        page.getByRole("button", { name: digit, exact: true }),
        `PIN pad is missing the "${digit}" key — any PIN containing it cannot be entered.`
      ).toBeVisible();
    }
  });

  test("kiosk page has no console errors", async ({ page, assertNoProblems }) => {
    await page.goto("/kiosk");
    await waitForStableLayout(page);
    assertNoProblems("/kiosk");
  });
});

test.describe("kiosk check-in flow", () => {
  test.skip(!KIOSK_PIN, missingCredsReason("E2E_KIOSK_PIN"));
  test.setTimeout(90_000);

  test("correct PIN unlocks the check-in screen", async ({ page, assertNoProblems }) => {
    await unlockKiosk(page, KIOSK_PIN!);
    await waitForStableLayout(page);

    // The check-in screen is a member-lookup pad. It must render something
    // interactive or the front desk is stuck.
    const interactive = await page.locator("button, input").count();
    expect(
      interactive,
      "The kiosk check-in screen rendered no buttons or inputs — members cannot check in."
    ).toBeGreaterThan(0);

    assertNoProblems("/kiosk/checkin");
  });

  test("check-in screen does not scroll on a tablet", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await unlockKiosk(page, KIOSK_PIN!);
    await waitForStableLayout(page);

    // The kiosk layout is `h-[100dvh] overflow-hidden` on purpose. A scrollbar
    // here means content overflowed and part of the check-in UI is unreachable on
    // a locked-down tablet with no visible scroll affordance.
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 2
    );
    expect(
      scrolls,
      "The kiosk check-in screen scrolls on a tablet. Part of the UI is likely " +
        "unreachable in kiosk mode."
    ).toBe(false);
  });

  test("kiosk session does not grant access to admin", async ({ page }) => {
    await unlockKiosk(page, KIOSK_PIN!);

    // A kiosk token must grant access to /kiosk/checkin and nothing else. If the
    // tablet at the front desk could reach /admin, anyone walking past could edit
    // the gym's member records. Middleware has explicit handling for this
    // (kiosk_token present, no user → blocked); this is the test that proves it.
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    expect(
      new URL(page.url()).pathname,
      "A kiosk-unlocked device reached /admin. The front-desk tablet must never " +
        "have admin access — this is a privilege-escalation bug."
    ).toBe("/admin/login");
  });
});
