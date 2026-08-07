import { test, expect, gotoOk, waitForStableLayout } from "../../support/fixtures";
import { PUBLIC_ROUTES } from "../../support/routes";

/**
 * Responsive layout defects — the category the user is most likely to mean by
 * "improvements and bugs we haven't seen", because these are invisible unless
 * someone happens to open the page at that exact width.
 *
 * Three checks, each catching a distinct real-world failure:
 *
 *   horizontal overflow  → the page scrolls sideways on a phone
 *   tiny tap targets     → buttons too small to hit with a thumb
 *   content clipping     → text cut off by a fixed-height container
 */

/** Widths chosen to bracket the app's Tailwind breakpoints plus the `nav:` custom one. */
const VIEWPORTS = [
  { name: "iPhone SE (smallest common)", width: 320, height: 568 },
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPad portrait", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "wide desktop", width: 1920, height: 1080 },
] as const;

/** Routes worth sweeping at every width. Login pages are simple but high-traffic. */
const RESPONSIVE_ROUTES = PUBLIC_ROUTES.filter((r) =>
  ["/", "/join", "/portal/login", "/admin/login", "/kiosk", "/privacy", "/terms"].includes(r.path)
);

test.describe("no horizontal overflow", () => {
  for (const viewport of VIEWPORTS) {
    for (const route of RESPONSIVE_ROUTES) {
      test(`${route.path} does not scroll sideways at ${viewport.width}px (${viewport.name})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await gotoOk(page, route.path);
        await waitForStableLayout(page);

        const overflow = await page.evaluate(() => {
          const docWidth = document.documentElement.scrollWidth;
          const viewWidth = document.documentElement.clientWidth;
          if (docWidth <= viewWidth + 1) return null;

          // Identify the specific culprit elements. Reporting "the page
          // overflows by 40px" is useless; reporting which element is 40px too
          // wide is immediately fixable.
          const culprits: string[] = [];
          document.querySelectorAll("*").forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            if (rect.right > viewWidth + 1) {
              const tag = el.tagName.toLowerCase();
              const cls =
                typeof el.className === "string" && el.className
                  ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
                  : "";
              const id = el.id ? `#${el.id}` : "";
              const text = (el.textContent ?? "").trim().slice(0, 30);
              culprits.push(
                `${tag}${id}${cls} — right edge at ${Math.round(rect.right)}px${
                  text ? ` ("${text}")` : ""
                }`
              );
            }
          });

          return {
            overflowBy: docWidth - viewWidth,
            docWidth,
            viewWidth,
            // Deepest/narrowest offenders first would be ideal, but the outermost
            // ones are usually the true cause, so keep document order and cap it.
            culprits: culprits.slice(0, 6),
          };
        });

        expect(
          overflow,
          overflow
            ? `${route.path} overflows horizontally by ${overflow.overflowBy}px at ` +
              `${viewport.width}px wide (content ${overflow.docWidth}px vs viewport ` +
              `${overflow.viewWidth}px). Users can scroll the page sideways.\n` +
              `  Likely culprits:\n${overflow.culprits.map((c) => `    - ${c}`).join("\n")}`
            : ""
        ).toBeNull();
      });
    }
  }
});

test.describe("touch target sizes", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const route of ["/", "/join", "/portal/login", "/kiosk"]) {
    test(`${route} has thumb-sized tap targets`, async ({ page }) => {
      await gotoOk(page, route);
      await waitForStableLayout(page);

      /**
       * 24x24 CSS px — WCAG 2.2 SC 2.5.8 (Target Size, Minimum) at level AA.
       * Deliberately the published standard rather than a number we picked:
       * a nightly that fails on a threshold nobody agreed to gets muted. Apple's
       * HIG asks for 44px, which is a design goal, not a defect.
       *
       * The exemptions below are the ones written into SC 2.5.8 itself, not
       * conveniences — each was added after it produced a false report here:
       *   - "Inline": links inside a run of prose
       *   - "Spacing": a small target is fine if no other target intrudes on a
       *     24px circle centred on it (carousel dots, stacked nav links)
       *   - checkboxes/radios whose <label> extends the clickable area
       */
      const MIN_SIZE = 24;

      const tooSmall = await page.evaluate((min) => {
        const results: string[] = [];
        const selector =
          'a, button, [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"]';

        /** True when the element is a run of text inside a larger block of text. */
        function isInlineText(element: HTMLElement): boolean {
          if (element.tagName !== "A") return false;
          if (getComputedStyle(element).display !== "inline") return false;
          const parent = element.parentElement;
          if (!parent) return false;
          // Only exempt it if the parent really is prose around it — a link that
          // is the sole content of its container is a standalone target.
          const own = (element.textContent ?? "").trim().length;
          const surrounding = (parent.textContent ?? "").trim().length;
          return surrounding > own;
        }

        /**
         * A native checkbox is 13x13 in every browser. What matters is whether
         * the user has a big enough thing to hit, which for a properly labelled
         * checkbox is the label. Measure that instead of the box.
         */
        function effectiveRect(element: HTMLElement): DOMRect {
          const tag = element.tagName.toLowerCase();
          const type = element.getAttribute("type");
          if (tag !== "input" || (type !== "checkbox" && type !== "radio")) {
            return element.getBoundingClientRect();
          }
          const id = element.id;
          const label =
            element.closest("label") ??
            (id ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(id)}"]`) : null);
          return (label ?? element).getBoundingClientRect();
        }

        // Collect first so the spacing exception can measure neighbours.
        const targets: { element: HTMLElement; rect: DOMRect }[] = [];
        document.querySelectorAll(selector).forEach((el) => {
          const element = el as HTMLElement;
          if (element.offsetParent === null) return; // hidden
          if (isInlineText(element)) return;
          const rect = effectiveRect(element);
          if (rect.width === 0 || rect.height === 0) return;
          targets.push({ element, rect });
        });

        /**
         * SC 2.5.8 "Spacing" exception: an undersized target passes if a circle
         * of diameter `min`, centred on it, intersects no other target's circle.
         * This is what makes carousel dots and generously-spaced stacked links
         * conformant — they are small, but nothing else is near enough to
         * mis-tap. Without this the check fires on compliant UI and gets muted.
         */
        function hasClearSpacing(rect: DOMRect, index: number): boolean {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          for (let i = 0; i < targets.length; i++) {
            if (i === index) continue;
            const other = targets[i].rect;
            const ox = other.left + other.width / 2;
            const oy = other.top + other.height / 2;
            const distance = Math.hypot(cx - ox, cy - oy);
            // Two `min`-diameter circles clear each other at `min` apart.
            if (distance < min) return false;
          }
          return true;
        }

        targets.forEach(({ element, rect }, index) => {
          if (rect.width < min || rect.height < min) {
            if (hasClearSpacing(rect, index)) return;
            const label =
              element.getAttribute("aria-label") ||
              (element.textContent ?? "").trim().slice(0, 30) ||
              element.getAttribute("href") ||
              `${element.tagName.toLowerCase()}[type=${element.getAttribute("type") ?? "?"}]`;
            results.push(
              `"${label}" is ${Math.round(rect.width)}x${Math.round(rect.height)}px`
            );
          }
        });

        return results.slice(0, 10);
      }, MIN_SIZE);

      expect(
        tooSmall,
        `${route} has controls smaller than ${MIN_SIZE}x${MIN_SIZE}px on a phone — ` +
          `hard to tap accurately:\n${tooSmall.map((t) => `    - ${t}`).join("\n")}`
      ).toHaveLength(0);
    });
  }
});

test.describe("content clipping", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("no text is clipped by its container at 320px", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    // A fixed-height container with `overflow: hidden` silently truncates
    // content when text wraps to more lines than the designer expected. This
    // shows up only at narrow widths and long strings — a gym name longer than
    // the placeholder, for instance.
    const clipped = await page.evaluate(() => {
      const results: string[] = [];

      document.querySelectorAll("h1, h2, h3, p, span, div, button, a").forEach((el) => {
        const element = el as HTMLElement;
        if (element.offsetParent === null) return;

        const style = getComputedStyle(element);
        if (style.overflow !== "hidden" && style.overflowY !== "hidden") return;
        // `text-overflow: ellipsis` and `line-clamp` are deliberate truncation.
        if (style.textOverflow === "ellipsis") return;
        if (style.webkitLineClamp && style.webkitLineClamp !== "none") return;

        // More than a couple of px of hidden content means real clipping, not a
        // sub-pixel rounding artefact.
        const hiddenPx = element.scrollHeight - element.clientHeight;
        if (hiddenPx > 4 && element.clientHeight > 0) {
          const text = (element.textContent ?? "").trim().slice(0, 40);
          results.push(
            `<${element.tagName.toLowerCase()}> hides ${hiddenPx}px of content ("${text}")`
          );
        }
      });

      return results.slice(0, 8);
    });

    expect(
      clipped,
      `Content is clipped by fixed-height containers at 320px:\n` +
        clipped.map((c) => `    - ${c}`).join("\n") +
        `\nThese containers have overflow:hidden but their content is taller than they are.`
    ).toHaveLength(0);
  });
});

test.describe("kiosk layout", () => {
  // The kiosk runs full-screen on a tablet at the front desk and its layout uses
  // `h-[100dvh] overflow-hidden` — it must never scroll, and the PIN pad must be
  // fully reachable. A regression here is discovered by a member standing at the
  // desk, which is the worst possible place to find it.
  const KIOSK_VIEWPORTS = [
    { name: "iPad portrait", width: 768, height: 1024 },
    { name: "iPad landscape", width: 1024, height: 768 },
    { name: "small tablet", width: 600, height: 960 },
  ] as const;

  for (const vp of KIOSK_VIEWPORTS) {
    test(`kiosk PIN pad fits without scrolling on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await gotoOk(page, "/kiosk");
      await waitForStableLayout(page);

      const scrolls = await page.evaluate(
        () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 2
      );
      expect(
        scrolls,
        `The kiosk page scrolls vertically on a ${vp.name}. The kiosk layout sets ` +
          `h-[100dvh] overflow-hidden precisely so it never does — something inside ` +
          `is taller than the viewport.`
      ).toBe(false);

      // Every digit must be on screen. A "7" pushed below the fold makes any PIN
      // containing it impossible to enter.
      for (const digit of ["1", "5", "9", "0"]) {
        const key = page.getByRole("button", { name: digit, exact: true });
        await expect(
          key,
          `PIN pad digit "${digit}" is not visible on a ${vp.name} — PINs containing ` +
            `it cannot be entered.`
        ).toBeInViewport();
      }
    });
  }
});
