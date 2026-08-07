import { test, expect, gotoOk } from "../../support/fixtures";
import { FORBIDDEN_STRINGS, PUBLIC_ROUTES } from "../../support/routes";

/**
 * Guards the two content failure modes this repo actually has, per SETUP.md:
 *
 *   1. Unreplaced `TODO_*` placeholders reaching a live page. `gym-profile.ts`
 *      still ships `TODO_CITY`, `TODO_PHONE`, `TODO_ADDRESS` etc. as fallbacks,
 *      so any deploy whose `site_settings` row is missing a key renders them
 *      verbatim to visitors.
 *
 *   2. Leftover strings from the upstream MGD Dallas template the repo was
 *      forked from.
 *
 * `scripts/smoke-test.ts` already checks the raw SSR HTML. This checks the
 * *rendered DOM* after hydration, which additionally catches placeholders that
 * only appear in client components (the nav logo, the portal login header) and
 * content injected from the DB at runtime.
 */

test.describe("no placeholder or forked-template content is visible", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} (${route.path}) has no forbidden strings`, async ({ page }) => {
      await gotoOk(page, route.path);
      // Wait for hydration so client-rendered text (nav logo, gym profile
      // context consumers) is present before we read it.
      await page.waitForLoadState("networkidle").catch(() => {});

      const visibleText = await page.locator("body").innerText();

      const hits = FORBIDDEN_STRINGS.filter((needle) => visibleText.includes(needle));

      expect(
        hits,
        `${route.path} shows placeholder / forked-template content: ${hits.join(", ")}.\n` +
          `  TODO_* means a required site_settings value was never filled in (see SETUP.md).\n` +
          `  An MGD string means rebranding missed a spot.`
      ).toHaveLength(0);
    });
  }
});

test.describe("legal pages", () => {
  // The privacy and terms pages ship as explicitly-marked scaffolds
  // (`src/content/privacy.md`, `terms.md`) and still carry `TODO_DOMAIN` in
  // their contact addresses. These tests are the reminder that they are
  // pre-launch blockers, and they fail loudly until an attorney-reviewed
  // version lands.
  test("privacy policy has real content and no unfilled domain", async ({ page }) => {
    await gotoOk(page, "/privacy");
    const text = await page.locator("body").innerText();

    expect(
      text.length,
      "The privacy page rendered almost nothing — check src/content/privacy.md loaded."
    ).toBeGreaterThan(500);

    expect(
      text.includes("TODO_DOMAIN"),
      "Privacy policy still contains TODO_DOMAIN in its contact addresses. " +
        "Replace with the real domain before launch (SETUP.md §2)."
    ).toBe(false);
  });

  test("terms of service has real content and no unfilled domain", async ({ page }) => {
    await gotoOk(page, "/terms");
    const text = await page.locator("body").innerText();

    expect(
      text.length,
      "The terms page rendered almost nothing — check src/content/terms.md loaded."
    ).toBeGreaterThan(500);

    expect(
      text.includes("TODO_DOMAIN"),
      "Terms of service still contains TODO_DOMAIN. Replace before launch (SETUP.md §2)."
    ).toBe(false);
  });
});

test.describe("contact details are configured", () => {
  test("footer shows a real phone, email, and address", async ({ page }) => {
    await gotoOk(page, "/");
    await page.waitForLoadState("networkidle").catch(() => {});

    const footer = page.locator("footer");
    await expect(footer, "The landing page has no <footer>").toBeVisible();

    const footerText = await footer.innerText();

    // These are the specific placeholders `DEFAULT_GYM_PROFILE` falls back to.
    // Naming them individually makes the failure tell you which site_settings
    // key is missing rather than just "something is unset".
    const placeholders = [
      "TODO_ADDRESS",
      "TODO_CITY",
      "TODO_STATE",
      "TODO_ZIP",
      "TODO_PHONE",
      "TODO_EMAIL",
    ].filter((p) => footerText.includes(p));

    expect(
      placeholders,
      `Footer is showing unset gym-profile placeholders: ${placeholders.join(", ")}. ` +
        `Run \`npx tsx scripts/bootstrap-gym.ts\` or set the matching site_settings keys.`
    ).toHaveLength(0);
  });

  test("tel: and mailto: links are well-formed", async ({ page }) => {
    await gotoOk(page, "/");
    await page.waitForLoadState("networkidle").catch(() => {});

    const telLinks = await page.locator('a[href^="tel:"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? "")
    );
    const mailLinks = await page.locator('a[href^="mailto:"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? "")
    );

    // A `tel:` href containing letters means the placeholder `phoneHref` was
    // never replaced — the link silently does nothing when a visitor taps it
    // on a phone, which is a conversion bug nobody notices from a desk.
    for (const href of telLinks) {
      const digits = href.replace(/^tel:/, "");
      expect(
        digits,
        `Broken phone link "${href}" — a tel: href must contain only digits, ` +
          `+, spaces, dashes, and parentheses. Tapping this on a phone does nothing.`
      ).toMatch(/^[+\d\s()\-.]+$/);
      expect(
        digits.replace(/\D/g, "").length,
        `Phone link "${href}" has too few digits to be dialable.`
      ).toBeGreaterThanOrEqual(7);
    }

    for (const href of mailLinks) {
      const address = href.replace(/^mailto:/, "").split("?")[0];
      expect(
        address,
        `Broken email link "${href}" — not a valid address.`
      ).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    }
  });
});
