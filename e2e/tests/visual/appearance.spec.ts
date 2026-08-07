import { test, expect, freezeAnimations, gotoOk, waitForStableLayout } from "../../support/fixtures";

/**
 * Visual regression. Opt-in via `E2E_VISUAL=1` (see playwright.config.ts) and
 * only meaningful when baselines and the run share a platform — the nightly
 * workflow compares Linux against Linux.
 *
 * Scope is deliberately narrow: full-page shots of the highest-traffic screens
 * at two widths. Screenshotting every section at every breakpoint produces a
 * baseline set nobody maintains, and an unmaintained visual suite is worse than
 * none — it trains the team to approve diffs without looking.
 *
 * To create or refresh baselines:
 *   E2E_VISUAL=1 npm run test:e2e:update-snapshots
 * Commit the resulting PNGs under e2e/snapshots/.
 */

/** Hide anything whose content legitimately changes between runs. */
async function maskDynamicContent(page: import("@playwright/test").Page) {
  // The landing page shows DB-driven news, schedule, and blog content that the
  // gym edits from /admin. Diffing it would fail every time they post an update,
  // which is the fastest way to make the whole suite ignored. So the visual
  // specs assert on *chrome and layout*, with data regions masked.
  return [
    page.locator("#updates"),
    page.locator("#blog"),
    page.locator("#instagram"),
    page.locator("#schedule"),
  ];
}

test.describe("landing page appearance", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`landing page looks right on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoOk(page, "/");
      await waitForStableLayout(page);
      await freezeAnimations(page);

      // Scroll through and back so lazy content has loaded and settled before the
      // shot — otherwise the baseline captures placeholder space.
      await page.evaluate(async () => {
        const step = window.innerHeight;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 100));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 300));
      });

      await expect(page).toHaveScreenshot(`landing-${viewport.name}.png`, {
        fullPage: true,
        mask: await maskDynamicContent(page),
      });
    });
  }
});

test.describe("auth screens appearance", () => {
  // These have no DB-driven content beyond the gym name, so they are stable
  // baselines and a diff here is almost always a real styling regression.
  const SCREENS = [
    { path: "/portal/login", name: "portal-login" },
    { path: "/admin/login", name: "admin-login" },
    { path: "/kiosk", name: "kiosk-pin" },
  ];

  for (const screen of SCREENS) {
    test(`${screen.path} looks right`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoOk(page, screen.path);
      await waitForStableLayout(page);
      await freezeAnimations(page);

      await expect(page).toHaveScreenshot(`${screen.name}.png`, { fullPage: true });
    });
  }

  test("portal login looks right on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoOk(page, "/portal/login");
    await waitForStableLayout(page);
    await freezeAnimations(page);

    await expect(page).toHaveScreenshot("portal-login-mobile.png", { fullPage: true });
  });
});

test.describe("component appearance", () => {
  test("navigation bar looks right", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoOk(page, "/");
    await waitForStableLayout(page);
    await freezeAnimations(page);

    // Element-scoped shots are more durable than full-page ones: a change further
    // down the page cannot invalidate them.
    await expect(page.locator("nav").first()).toHaveScreenshot("navbar-desktop.png");
  });

  test("mobile menu overlay looks right", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoOk(page, "/");
    await waitForStableLayout(page);
    await freezeAnimations(page);

    await page.getByRole("button", { name: /abrir menú/i }).click();
    // The overlay animates in; wait for it to be fully painted.
    await page.waitForTimeout(400);

    await expect(page).toHaveScreenshot("mobile-menu-open.png");
  });

  test("footer looks right", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoOk(page, "/");
    await waitForStableLayout(page);
    await freezeAnimations(page);

    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await expect(footer).toHaveScreenshot("footer-desktop.png");
  });
});
