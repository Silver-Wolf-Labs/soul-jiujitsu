import { test as base, expect, type Page } from "@playwright/test";
import { watchForProblems, formatProblems, type PageProblem } from "./console-guard";

/**
 * Extended `test` used by every spec in this framework.
 *
 * Adds two things on top of Playwright's built-ins:
 *
 *   `problems`  — live list of console errors / uncaught exceptions / failed
 *                 requests / CSP violations seen on the page. Attached before
 *                 the first navigation so nothing is missed.
 *
 *   `assertNoProblems()` — opt-in assertion. It is NOT automatic in an
 *                 afterEach, deliberately: a test that fails for two unrelated
 *                 reasons is hard to triage at 3am, and some specs (the forms
 *                 one, for instance) intentionally trigger error states. Specs
 *                 call it where a clean console is part of the contract.
 */

export interface TestFixtures {
  problems: PageProblem[];
  assertNoProblems: (context?: string) => void;
}

export const test = base.extend<TestFixtures>({
  problems: async ({ page }, use) => {
    const problems = watchForProblems(page);
    await use(problems);
  },

  assertNoProblems: async ({ problems }, use) => {
    const assertNoProblems = (context = "page") => {
      expect(
        problems,
        `Browser reported ${problems.length} problem(s) on ${context}:\n${formatProblems(problems)}`
      ).toHaveLength(0);
    };
    await use(assertNoProblems);
  },
});

export { expect };

/**
 * Wait for the page to be visually settled before measuring layout or taking a
 * screenshot.
 *
 * `networkidle` alone is not enough here: the app streams RSC payloads and
 * `next/font` swaps fonts after first paint, both of which move layout after
 * the network goes quiet. Waiting on `document.fonts.ready` plus two animation
 * frames removes the two flake sources we actually hit.
 */
export async function waitForStableLayout(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  // Not fatal if the network never fully idles (RUM beacons, long-poll) —
  // fall through after a bounded wait rather than failing the test.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/**
 * Freeze anything that would make a screenshot non-deterministic: CSS
 * animations, transitions, smooth scrolling, and caret blink. Applied by visual
 * specs only — functional specs should exercise real animation behaviour.
 */
export async function freezeAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  });
}

/**
 * Navigate and assert the document itself came back healthy.
 *
 * Returns the final URL so callers can assert on redirects. Throws a message
 * naming the route, because "expected 200, got 500" without a path is useless
 * in a nightly log with 40 tests in it.
 */
export async function gotoOk(page: Page, path: string): Promise<string> {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `No response received for ${path}`).not.toBeNull();
  expect(
    response!.status(),
    `${path} returned HTTP ${response!.status()} (expected < 400)`
  ).toBeLessThan(400);
  return page.url();
}
