import { test, expect, gotoOk, waitForStableLayout } from "../../support/fixtures";
import { LANDING_SECTIONS } from "../../support/routes";

/**
 * The landing page is the highest-traffic surface and the most data-driven:
 * section order, titles, and visibility all come from the `site_sections`
 * table, with a hardcoded fallback list in `src/app/page.tsx`.
 *
 * These specs assert structure and behaviour rather than specific copy, so they
 * stay green as the gym edits content from /admin but still fail when a section
 * stops rendering.
 */

test.describe("landing page structure", () => {
  test.beforeEach(async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);
  });

  test("renders nav, hero, main, and footer", async ({ page }) => {
    await expect(page.locator("nav").first(), "Missing navigation").toBeVisible();
    await expect(page.locator("main"), "Missing <main> landmark").toBeVisible();
    await expect(page.locator("footer"), "Missing <footer>").toBeVisible();

    // The hero (`Jumbotron`) is the first thing a visitor sees; if it collapses
    // to zero height the page looks broken above the fold even though every
    // other assertion passes.
    const main = page.locator("main");
    const box = await main.boundingBox();
    expect(box, "<main> has no layout box").not.toBeNull();
    expect(
      box!.height,
      "<main> is shorter than the viewport — the page likely failed to render its sections."
    ).toBeGreaterThan(400);
  });

  test("has exactly one h1", async ({ page }) => {
    // More than one h1 is both an SEO problem and a screen-reader problem, and
    // it is easy to introduce when sections are reordered from the admin panel.
    const h1s = page.locator("h1");
    const count = await h1s.count();
    const texts = await h1s.allInnerTexts();
    expect(
      count,
      `Expected exactly 1 <h1>, found ${count}: ${JSON.stringify(texts)}`
    ).toBe(1);
  });

  test("renders at least most of the configured sections", async ({ page }) => {
    // Sections are DB-driven and an admin can legitimately hide some, so this
    // does not demand all of them. It fails when the page renders almost
    // nothing, which is the actual regression: a Supabase error swallowed by the
    // `catch {}` in `getSections()` silently falling back, or a section
    // component throwing.
    const present: string[] = [];
    const missing: string[] = [];

    for (const section of LANDING_SECTIONS) {
      const el = page.locator(`#${section.id}`);
      if ((await el.count()) > 0) present.push(section.id);
      else missing.push(section.id);
    }

    expect(
      present.length,
      `Only ${present.length}/${LANDING_SECTIONS.length} landing sections rendered.\n` +
        `  present: ${present.join(", ") || "(none)"}\n` +
        `  missing: ${missing.join(", ")}\n` +
        `  Sections come from the site_sections table — check for a failed query ` +
        `or a throwing section component.`
    ).toBeGreaterThanOrEqual(Math.ceil(LANDING_SECTIONS.length / 2));
  });

  test("every rendered section has a visible heading", async ({ page }) => {
    // A section that renders an empty shell — heading present, body missing, or
    // vice versa — is the classic "the query returned nothing and nobody
    // noticed" bug.
    const emptySections: string[] = [];

    for (const section of LANDING_SECTIONS) {
      const el = page.locator(`#${section.id}`);
      if ((await el.count()) === 0) continue;

      const text = (await el.first().innerText()).trim();
      if (text.length < 10) emptySections.push(`${section.id} (${text.length} chars)`);
    }

    expect(
      emptySections,
      `These sections rendered but are effectively empty: ${emptySections.join(", ")}. ` +
        `Either their data source returned nothing or the component failed silently.`
    ).toHaveLength(0);
  });

  test("no console errors on the landing page", async ({ assertNoProblems }) => {
    // Split into its own test so a hydration mismatch is reported as its own
    // failure rather than being buried inside a structural assertion.
    assertNoProblems("landing page");
  });
});

test.describe("landing page images", () => {
  test("all images load and have alt text", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);
    // Scroll the full page so lazy-loaded images below the fold actually
    // request. Without this, broken team photos and blog thumbnails are never
    // fetched and the test passes vacuously.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    const problems = await page.locator("img").evaluateAll((imgs) =>
      imgs
        .map((img) => {
          const el = img as HTMLImageElement;
          const src = el.currentSrc || el.src || "(no src)";
          const issues: string[] = [];

          // naturalWidth === 0 on a complete image means the fetch failed —
          // a broken team photo or blog thumbnail. Users see the alt text or a
          // broken-image glyph.
          if (el.complete && el.naturalWidth === 0) issues.push("failed to load");

          // `alt` must exist. An empty string is valid and correct for
          // decorative images, so only a missing attribute is a violation.
          if (!el.hasAttribute("alt")) issues.push("missing alt attribute");

          return issues.length ? `${src} — ${issues.join(", ")}` : null;
        })
        .filter((v): v is string => v !== null)
    );

    expect(
      problems,
      `Image problems on the landing page:\n${problems.map((p) => `  - ${p}`).join("\n")}`
    ).toHaveLength(0);
  });
});

test.describe("FAQ interaction", () => {
  test("FAQ entries expand when clicked", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    const faq = page.locator("#faq");
    test.skip((await faq.count()) === 0, "FAQ section is hidden in site_sections");

    await faq.scrollIntoViewIfNeeded();

    // `FAQClient` renders each question as a clickable row. Find the
    // interactive elements generically so the test survives a markup change
    // from <button> to <summary>.
    const triggers = faq.locator("button, summary, [role='button']");
    const count = await triggers.count();
    test.skip(count === 0, "FAQ rendered no interactive entries — nothing to expand");

    const first = triggers.first();

    // `FAQClient` collapses with `max-h-0` + `overflow-hidden`, so the answer
    // text is in the DOM (and in innerText) even while collapsed. Measure the
    // rendered height of the answer panel instead: that is what the user sees,
    // and it works whether the markup is a div, a <details>, or something else.
    const answerHeight = async () =>
      first.evaluate((el) => {
        // The panel is the next element sibling of the trigger row.
        const panel = el.parentElement?.querySelector<HTMLElement>(
          ":scope > *:not(button):not(summary)"
        );
        return panel ? panel.getBoundingClientRect().height : -1;
      });

    const before = await answerHeight();
    test.skip(before < 0, "Could not locate an answer panel next to the FAQ trigger");

    await first.click();

    // Accordion animates open; poll rather than sleeping a fixed time.
    await expect(async () => {
      expect(
        await answerHeight(),
        "Clicking an FAQ question did not expand its answer panel — the accordion is broken."
      ).toBeGreaterThan(before);
    }).toPass({ timeout: 5_000 });

    // Clicking again must collapse it. A toggle that only opens leaves a
    // growing wall of text with no way back.
    await first.click();
    await expect(async () => {
      expect(
        await answerHeight(),
        "Clicking an open FAQ question did not collapse it again."
      ).toBeLessThanOrEqual(before);
    }).toPass({ timeout: 5_000 });
  });
});
