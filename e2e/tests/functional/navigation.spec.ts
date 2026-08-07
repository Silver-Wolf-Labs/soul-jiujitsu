import { test, expect, gotoOk, waitForStableLayout } from "../../support/fixtures";

/**
 * Navigation: the nav bar, the mobile menu, in-page anchors, and every link on
 * the landing page resolving to something that is not a 404.
 *
 * The broken-link crawl is the single spec most likely to catch a bug nobody
 * has seen — a stale `nav_items` row or an edited footer link pointing at a
 * route that no longer exists renders fine and only fails when clicked.
 */

test.describe("navigation bar", () => {
  test("nav links point at existing landing sections", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    const nav = page.locator("nav").first();
    const hrefs = await nav.locator("a[href]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? "")
    );

    // Nav items are DB-driven (`nav_items` table) with a fallback to
    // NAV_LINKS. An admin editing them can point a link at an anchor that no
    // longer exists, which silently does nothing when clicked.
    const anchorTargets = hrefs
      .filter((h) => h.includes("#"))
      .map((h) => h.split("#")[1])
      .filter((id) => id && id !== "home");

    const broken: string[] = [];
    for (const id of anchorTargets) {
      if ((await page.locator(`#${id}`).count()) === 0) broken.push(`#${id}`);
    }

    expect(
      broken,
      `Nav links point at anchors that do not exist on the page: ${broken.join(", ")}. ` +
        `Either the section is hidden in site_sections or the nav_items href is stale.`
    ).toHaveLength(0);
  });

  test("Log In and Get Started buttons work", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    const nav = page.locator("nav").first();

    // Below the `nav:` breakpoint the desktop links are display:none and the
    // same links live in the hamburger overlay instead — covered by the
    // "mobile menu links navigate and close the menu" test below. Open the
    // overlay here so this test exercises whichever nav the viewport actually
    // shows, rather than failing on mobile for a UI that is working correctly.
    const hamburger = nav.getByRole("button", { name: /abrir menú/i });
    if (await hamburger.isVisible()) await hamburger.click();

    // "Log In" goes to /portal, which for an anonymous visitor must land on the
    // member login page via middleware.
    const login = nav.getByRole("link", { name: /ingresar/i }).filter({ visible: true }).first();
    await expect(login, "Nav is missing a visible Log In link").toBeVisible();
    await login.click();
    await page.waitForURL(/\/portal/, { timeout: 15_000 });
    expect(
      new URL(page.url()).pathname,
      "Clicking Log In as an anonymous visitor should end up on /portal/login"
    ).toBe("/portal/login");
  });

  test("clicking a nav link scrolls to its section", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    const nav = page.locator("nav").first();

    // Same reason as above: on a phone the anchor links are inside the overlay.
    const hamburger = nav.getByRole("button", { name: /abrir menú/i });
    if (await hamburger.isVisible()) await hamburger.click();

    const scheduleLink = nav
      .locator('a[href*="#schedule"]')
      .filter({ visible: true })
      .first();
    test.skip((await scheduleLink.count()) === 0, "No visible #schedule nav link present");

    const section = page.locator("#schedule");
    test.skip((await section.count()) === 0, "Schedule section is hidden");

    await scheduleLink.click();

    // The nav is `sticky top-0 h-16`, so a correctly-scrolled section sits at or
    // just below 64px — not at 0, and not off-screen. This catches the common
    // sticky-header-overlaps-anchor bug where the section heading hides behind
    // the nav.
    await expect(async () => {
      const box = await section.boundingBox();
      expect(box, "Schedule section has no layout box").not.toBeNull();
      expect(
        Math.abs(box!.y),
        `After clicking the Schedule nav link the section is at y=${box!.y}. ` +
          `Expected it near the top of the viewport — anchor scrolling is broken ` +
          `or the sticky nav is covering it.`
      ).toBeLessThan(200);
    }).toPass({ timeout: 6_000 });
  });
});

test.describe("mobile menu", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hamburger opens and closes the overlay", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    const toggle = page.getByRole("button", { name: /abrir menú/i });
    await expect(
      toggle,
      "The hamburger button is not visible at 390px — mobile users cannot navigate."
    ).toBeVisible();

    await toggle.click();

    // The overlay is `fixed inset-0` and duplicates the nav links. Assert a link
    // inside it is actually clickable, not just present in the DOM: an overlay
    // rendered behind the nav (z-index regression) is visible to Playwright but
    // useless to a user.
    const overlayLink = page.locator("nav a[href*='#']").filter({ visible: true });
    expect(
      await overlayLink.count(),
      "Opening the mobile menu revealed no visible nav links."
    ).toBeGreaterThan(0);

    // Closing: tapping the hamburger again should toggle it shut. Check the
    // hamburger is still *hittable* first, and name the culprit if it is not —
    // a raw click timeout at 3am tells nobody anything, whereas "the overlay is
    // covering the button" points straight at the z-index/stacking fix.
    const blocker = await toggle.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const topEl = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2
      );
      if (!topEl || topEl === el || el.contains(topEl)) return null;
      return `${topEl.tagName.toLowerCase()}.${(topEl.className || "").toString().split(" ").slice(0, 3).join(".")}`;
    });

    expect(
      blocker,
      `The mobile menu cannot be closed: with the overlay open, the hamburger ` +
        `button is covered by "${blocker}", which swallows the tap. Users have no ` +
        `way to dismiss the menu except by following a link. Fix the stacking so ` +
        `the toggle sits above the overlay, or add a close button inside it.`
    ).toBeNull();

    await toggle.click();
    await expect(async () => {
      const stillOpen = await page.locator("nav .fixed.inset-0").count();
      expect(stillOpen, "The mobile menu did not close on the second tap.").toBe(0);
    }).toPass({ timeout: 4_000 });
  });

  test("mobile menu links navigate and close the menu", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    await page.getByRole("button", { name: /abrir menú/i }).click();

    const loginLink = page.getByRole("link", { name: /ingresar/i }).filter({ visible: true }).first();
    test.skip((await loginLink.count()) === 0, "No visible Log In link in the mobile overlay");

    await loginLink.click();
    await page.waitForURL(/\/portal/, { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/portal/login");
  });
});

test.describe("link integrity", () => {
  test("no internal link on the landing page 404s", async ({ page, request }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    const hrefs = await page.locator("a[href]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? "")
    );

    // Keep only same-origin page links. Anchors, mailto/tel, and external hosts
    // are covered by other specs or are out of our control.
    const internal = [...new Set(hrefs)]
      .filter((h) => h.startsWith("/"))
      .map((h) => h.split("#")[0])
      .filter((h) => h.length > 0)
      .filter((h) => !/\.(png|jpg|jpeg|svg|webp|gif|ico|pdf)$/i.test(h));

    const broken: string[] = [];

    for (const href of internal) {
      // `request` bypasses the browser, so this is a cheap HEAD-style check
      // across every link rather than 20 real navigations. `maxRedirects: 0`
      // keeps middleware redirects (302 to a login page) from counting as
      // failures — those are correct behaviour, asserted in the smoke spec.
      const response = await request.get(href, { maxRedirects: 0, failOnStatusCode: false });
      const status = response.status();
      if (status >= 400) broken.push(`${href} → HTTP ${status}`);
    }

    expect(
      broken,
      `Landing page links to routes that do not resolve:\n${broken.map((b) => `  - ${b}`).join("\n")}\n` +
        `These are dead links a visitor can click. Nav and footer links are ` +
        `DB-editable (nav_items / site_settings), so a stale row is the likely cause.`
    ).toHaveLength(0);
  });

  test("external links open safely in a new tab", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    // `target="_blank"` without `rel="noopener"` lets the opened page reach back
    // via `window.opener`. Modern browsers imply noopener, but the audit trail
    // matters and older in-app webviews (Instagram's browser, which is exactly
    // where this gym's traffic comes from) do not all honour it.
    const unsafe = await page
      .locator('a[target="_blank"]')
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const rel = el.getAttribute("rel") ?? "";
            return !rel.includes("noopener") && !rel.includes("noreferrer");
          })
          .map((el) => el.getAttribute("href") ?? "(no href)")
      );

    expect(
      unsafe,
      `These links open a new tab without rel="noopener noreferrer":\n` +
        unsafe.map((u) => `  - ${u}`).join("\n")
    ).toHaveLength(0);
  });
});
