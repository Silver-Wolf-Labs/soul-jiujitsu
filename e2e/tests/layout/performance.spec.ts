import { test, expect, gotoOk, waitForStableLayout } from "../../support/fixtures";

/**
 * Perceived-performance and UX defects that are measurable in a browser.
 *
 * These are the "possible improvements" side of the brief rather than hard bugs,
 * so the thresholds are set where a real user would notice — not at
 * Lighthouse-perfect. A nightly that demands a perfect CLS score every night
 * gets muted; one that fires when the hero visibly jumps gets acted on.
 */

test.describe("layout stability", () => {
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1280, height: 800 },
  ]) {
    test(`landing page does not visibly shift on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Install the observer before navigating so no shift is missed. Shifts that
      // follow a user interaction within 500ms are excluded by the CLS spec
      // (`hadRecentInput`) because they are expected.
      await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            };
            if (!shift.hadRecentInput) {
              (window as unknown as { __cls: number }).__cls += shift.value;
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      });

      await gotoOk(page, "/");
      await waitForStableLayout(page);
      // Give late-arriving fonts and images time to do their damage.
      await page.waitForTimeout(2_000);

      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);

      // 0.25 is Core Web Vitals' "poor" boundary. Failing at "poor" rather than at
      // the 0.1 "good" boundary keeps this actionable: below 0.25 users rarely
      // notice, above it the page visibly jumps under their thumb.
      expect(
        cls,
        `Cumulative Layout Shift is ${cls.toFixed(3)} on ${viewport.name} ` +
          `(> 0.25 is "poor"). The page visibly jumps while loading — usually an ` +
          `image or embed without reserved dimensions, or a font swap. Check for ` +
          `<img> without width/height and the next/font display strategy.`
      ).toBeLessThan(0.25);
    });
  }
});

test.describe("image efficiency", () => {
  test("no image is served far larger than it is displayed", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Team photos and blog images are pasted in as URLs from Supabase Storage by
    // whoever edits the admin panel, so nothing enforces their dimensions. A 4000px
    // photo displayed at 200px wastes most of a mobile visitor's data budget and
    // is the most likely real performance problem on this site.
    const oversized = await page.locator("img").evaluateAll((imgs) =>
      imgs
        .map((img) => {
          const el = img as HTMLImageElement;
          if (!el.complete || el.naturalWidth === 0) return null;
          const rect = el.getBoundingClientRect();
          if (rect.width < 10) return null;

          // Account for high-DPI: a 2x display legitimately wants 2x pixels.
          const displayedAtDpr = rect.width * Math.max(window.devicePixelRatio, 2);
          const ratio = el.naturalWidth / displayedAtDpr;

          if (ratio < 2.5) return null;

          return (
            `${el.currentSrc || el.src} — ${el.naturalWidth}px wide, displayed at ` +
            `${Math.round(rect.width)}px (${ratio.toFixed(1)}x oversized)`
          );
        })
        .filter((v): v is string => v !== null)
    );

    expect(
      oversized,
      `These images are served much larger than they are displayed, wasting mobile ` +
        `data:\n${oversized.map((o) => `    - ${o}`).join("\n")}\n` +
        `Resize before uploading to Supabase Storage, or route them through ` +
        `next/image so it can serve a scaled variant.`
    ).toHaveLength(0);
  });

  test("below-the-fold images are lazy-loaded", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    // An eagerly-loaded team grid delays the hero on a phone connection. Only
    // images well below the fold are checked, so the hero itself is exempt.
    const eager = await page.locator("img").evaluateAll((imgs) =>
      imgs
        .map((img) => {
          const el = img as HTMLImageElement;
          const rect = el.getBoundingClientRect();
          // More than 1.5 viewports down.
          if (rect.top < window.innerHeight * 1.5) return null;
          const loading = el.getAttribute("loading");
          if (loading === "lazy") return null;
          return `${el.getAttribute("src") ?? "(no src)"} at y=${Math.round(rect.top)}px`;
        })
        .filter((v): v is string => v !== null)
    );

    expect(
      eager,
      `These images load eagerly despite being far below the fold, delaying first ` +
        `paint:\n${eager.map((e) => `    - ${e}`).join("\n")}\n` +
        `Add loading="lazy" or use next/image, which does it by default.`
    ).toHaveLength(0);
  });
});

test.describe("page weight", () => {
  test("landing page does not ship an unreasonable payload", async ({ page }) => {
    let totalBytes = 0;
    const byType = new Map<string, number>();

    page.on("response", async (response) => {
      try {
        const headers = response.headers();
        const length = Number(headers["content-length"] ?? 0);
        if (!length) return;
        totalBytes += length;
        const type = response.request().resourceType();
        byType.set(type, (byType.get(type) ?? 0) + length);
      } catch {
        // A response body can be gone by the time we ask; not worth failing over.
      }
    });

    await gotoOk(page, "/");
    await waitForStableLayout(page);

    const totalMb = totalBytes / 1_048_576;
    const breakdown = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, bytes]) => `${type}: ${(bytes / 1024).toFixed(0)} KB`)
      .join(", ");

    // 6 MB is generous — it will not fail on a normal page, but it catches
    // someone uploading an unoptimised hero photo straight from a phone camera.
    expect(
      totalMb,
      `The landing page transferred ${totalMb.toFixed(2)} MB above the fold.\n` +
        `  Breakdown: ${breakdown}\n` +
        `  This is slow on gym-parking-lot mobile data. Usually one unoptimised image.`
    ).toBeLessThan(6);

    console.log(`\n  ⓘ Landing page weight: ${totalMb.toFixed(2)} MB (${breakdown})\n`);
  });
});
