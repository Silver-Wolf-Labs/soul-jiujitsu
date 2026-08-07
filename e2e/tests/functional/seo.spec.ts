import { test, expect, gotoOk } from "../../support/fixtures";
import { PUBLIC_ROUTES } from "../../support/routes";

/**
 * SEO and metadata. For a gym whose customers find it by searching the city
 * name, a missing title or a broken canonical URL is a direct revenue bug — and
 * one that no build, lint, or unit test can see.
 *
 * Titles and descriptions come from `generateMetadata()` in the root layout,
 * fed by `gym-profile.ts`. `metadataBase` uses `profile.meta.url`, which
 * defaults to `http://localhost:3000` until someone sets `gym_meta_url` in
 * site_settings — that default shipping to production is the specific bug the
 * canonical test below catches.
 */

test.describe("page metadata", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} (${route.path}) has a usable title and description`, async ({ page }) => {
      await gotoOk(page, route.path);

      const title = await page.title();
      expect(title.trim().length, `${route.path} has an empty <title>`).toBeGreaterThan(0);
      expect(
        title,
        `${route.path} has a placeholder title ("${title}") — check generateMetadata().`
      ).not.toMatch(/^(untitled|localhost|next\.js|create next app|TODO)/i);
      expect(
        title.length,
        `${route.path} title is ${title.length} chars; search engines truncate past ~60.`
      ).toBeLessThan(70);

      const description = await page
        .locator('meta[name="description"]')
        .getAttribute("content")
        .catch(() => null);

      // The root layout sets a description for every page, so a missing one
      // means metadata generation failed for that route.
      expect(
        description,
        `${route.path} has no <meta name="description"> — generateMetadata() did not run ` +
          `or gym_meta_description is unset.`
      ).toBeTruthy();
      expect(
        description!.trim().length,
        `${route.path} has an empty meta description.`
      ).toBeGreaterThan(20);
      expect(
        description,
        `${route.path} meta description contains an unfilled placeholder.`
      ).not.toContain("TODO_");
    });
  }
});

test.describe("document fundamentals", () => {
  test("html has a lang attribute", async ({ page }) => {
    await gotoOk(page, "/");
    const lang = await page.locator("html").getAttribute("lang");
    expect(
      lang,
      "<html> has no lang attribute — screen readers cannot pick a pronunciation " +
        "and this is a WCAG A failure."
    ).toBeTruthy();
  });

  test("viewport meta is present", async ({ page }) => {
    await gotoOk(page, "/");
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport, "No viewport meta tag — the site will not scale on mobile.").toBeTruthy();
    expect(viewport).toContain("width=device-width");
  });

  test("Open Graph tags are set for social sharing", async ({ page }) => {
    await gotoOk(page, "/");

    // The gym shares its page on Instagram; a missing og:title renders as a bare
    // URL in the preview card.
    for (const property of ["og:title", "og:description", "og:type"]) {
      const content = await page
        .locator(`meta[property="${property}"]`)
        .getAttribute("content")
        .catch(() => null);
      expect(
        content,
        `Missing or empty <meta property="${property}"> — link previews on ` +
          `Instagram/Facebook/WhatsApp will look broken.`
      ).toBeTruthy();
    }
  });

  test("metadataBase is not still pointing at localhost", async ({ page }) => {
    // `DEFAULT_GYM_PROFILE.meta.url` is `http://localhost:3000`. If site_settings
    // has no `gym_meta_url`, every absolute URL Next generates (canonical, OG
    // image, sitemap) points at localhost — invisible in the browser, fatal for
    // search and social. Only assert this when testing a deployed origin, since
    // localhost is correct when the suite boots its own server.
    const baseUrl = page.url();
    test.skip(
      baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1"),
      "Running against a local server — localhost URLs are expected here."
    );

    const absoluteUrls = await page
      .locator('link[rel="canonical"], meta[property^="og:"]')
      .evaluateAll((els) =>
        els
          .map((el) => el.getAttribute("href") || el.getAttribute("content") || "")
          .filter((v) => v.startsWith("http"))
      );

    const localhostLeaks = absoluteUrls.filter((u) => /localhost|127\.0\.0\.1/.test(u));

    expect(
      localhostLeaks,
      `These metadata URLs point at localhost on a deployed site: ${localhostLeaks.join(", ")}.\n` +
        `Set the \`gym_meta_url\` key in site_settings (or DEFAULT_GYM_PROFILE.meta.url) ` +
        `to the real domain — otherwise canonical tags and link previews are broken.`
    ).toHaveLength(0);
  });
});

test.describe("heading structure", () => {
  for (const route of PUBLIC_ROUTES.filter((r) => !r.path.includes("login"))) {
    test(`${route.path} heading levels do not skip`, async ({ page }) => {
      await gotoOk(page, route.path);
      await page.waitForLoadState("networkidle").catch(() => {});

      const levels = await page
        .locator("h1, h2, h3, h4, h5, h6")
        .evaluateAll((els) =>
          els
            .filter((el) => (el as HTMLElement).offsetParent !== null || el.tagName === "H1")
            .map((el) => ({
              level: Number(el.tagName[1]),
              text: (el.textContent ?? "").trim().slice(0, 40),
            }))
        );

      test.skip(levels.length === 0, "Page has no headings to check");

      // Skipping a level (h2 → h4) breaks screen-reader outline navigation. This
      // is reported as a hard failure rather than advisory because it is
      // unambiguous and cheap to fix, unlike axe's broader heading-order rule.
      const skips: string[] = [];
      for (let i = 1; i < levels.length; i++) {
        const jump = levels[i].level - levels[i - 1].level;
        if (jump > 1) {
          skips.push(
            `h${levels[i - 1].level} "${levels[i - 1].text}" → h${levels[i].level} "${levels[i].text}"`
          );
        }
      }

      expect(
        skips,
        `${route.path} skips heading levels:\n${skips.map((s) => `  - ${s}`).join("\n")}\n` +
          `Screen-reader users navigate by heading outline; a skipped level hides content.`
      ).toHaveLength(0);
    });
  }
});
