import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the UI test framework in `e2e/`.
 *
 * Two run modes, selected by env:
 *
 *   1. Local build (default, and what the nightly CI job uses) — Playwright
 *      boots `next start` itself via `webServer` and tests localhost:3000.
 *   2. Deployed URL — set `E2E_BASE_URL` to an Amplify/Vercel origin and the
 *      `webServer` block drops out, so we test the real deploy (CDN, real
 *      CSP headers, real data).
 *
 * Projects are split by *concern*, not just by browser, so the nightly report
 * says which class of problem regressed rather than only which spec:
 *
 *   chromium / mobile-chrome / webkit  → functional specs, cross-engine
 *   a11y                              → axe-core scans (chromium only)
 *   visual                             → screenshot diffs (chromium only,
 *                                        opt-in via E2E_VISUAL=1 because
 *                                        baselines are platform-specific)
 *   authenticated                      → portal/admin/kiosk flows, skipped
 *                                        automatically when no creds exist
 */

/**
 * A dedicated port, deliberately not 3000. Found the hard way: a `next start`
 * from an unrelated project was listening on 3000, `reuseExistingServer` picked
 * it up, and the whole suite ran green-ish against the wrong app — every
 * middleware redirect "failed" because those routes don't exist there. A
 * private port plus opt-in reuse (below) makes that class of false report
 * impossible. Override with E2E_PORT if 3210 is taken.
 */
const PORT = process.env.E2E_PORT || "3210";

const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

/** True when Playwright must boot the app itself rather than hit a deploy. */
const USES_LOCAL_SERVER = !process.env.E2E_BASE_URL;

const IS_CI = !!process.env.CI;

/**
 * Visual regression is opt-in. Screenshot baselines are rendered by the
 * platform's font stack, so a baseline committed from macOS fails on the
 * ubuntu CI runner and vice versa. The nightly workflow sets E2E_VISUAL=1
 * and only ever compares Linux-generated baselines against Linux runs.
 */
const VISUAL_ENABLED = process.env.E2E_VISUAL === "1";

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: "./e2e/.artifacts/test-results",

  // Aborts the whole run if the target origin isn't this app, instead of
  // reporting hundreds of bogus failures. See the file for the incident.
  globalSetup: "./e2e/support/global-setup.ts",

  snapshotPathTemplate:
    "./e2e/snapshots/{projectName}/{testFilePath}/{arg}{ext}",

  // A nightly run's job is to find *everything* broken in one pass, not to
  // stop at the first failure — so no `forbidOnly`-style early exit and no
  // maxFailures. Full signal every night.
  fullyParallel: true,
  forbidOnly: IS_CI,

  /**
   * One retry in CI. Rationale: a nightly that cries wolf gets muted within a
   * week, and the two flake sources here are real but transient (Supabase cold
   * start, Next's first-hit route compile). A test that passes on retry is
   * still surfaced in the report as "flaky" rather than silently swallowed, so
   * genuine instability stays visible.
   */
  retries: IS_CI ? 1 : 0,

  // The Next server is a single process; too much concurrency turns server
  // contention into fake timeouts. 4 is comfortable on a 2-core GH runner.
  workers: IS_CI ? 4 : undefined,

  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Anti-aliasing and sub-pixel text rendering differ slightly even
      // between runs on the same machine. 1.5% of pixels absorbs that
      // without hiding a real layout break.
      maxDiffPixelRatio: 0.015,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },

  reporter: [
    ["list"],
    ["html", { outputFolder: "./e2e/.artifacts/html-report", open: "never" }],
    ["json", { outputFile: "./e2e/.artifacts/results.json" }],
    ["junit", { outputFile: "./e2e/.artifacts/junit.xml" }],
    // Custom reporter: writes the GitHub Step Summary and the machine-readable
    // summary the nightly workflow reads to decide whether to open an issue.
    ["./e2e/reporters/nightly-reporter.ts"],
  ],

  use: {
    baseURL: BASE_URL,
    // Traces/videos only on the retry — capturing them on every test makes the
    // artifact hundreds of MB and slows the run, but when something fails at
    // 3am we need the full trace to debug without reproducing.
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // The app sets `maximumScale: 1, userScalable: false` in viewport meta;
    // ignoring HTTPS errors matters only for self-signed staging origins.
    ignoreHTTPSErrors: true,
    testIdAttribute: "data-testid",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/a11y/**", "**/visual/**", "**/authenticated/**"],
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
      testIgnore: ["**/a11y/**", "**/visual/**", "**/authenticated/**"],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      // Safari is the highest-risk engine for this app (dvh units in the kiosk
      // layout, sticky nav, backdrop filters) but the slowest to run, so it
      // covers the smoke + layout specs rather than the whole functional set.
      testMatch: ["**/smoke/**", "**/layout/**"],
    },
    {
      name: "a11y",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/a11y/**"],
    },
    {
      name: "authenticated",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/authenticated/**"],
    },
    ...(VISUAL_ENABLED
      ? [
          {
            name: "visual",
            use: { ...devices["Desktop Chrome"] },
            testMatch: ["**/visual/**"],
          },
        ]
      : []),
  ],

  webServer: USES_LOCAL_SERVER
    ? {
        // `next start` (not `next dev`): dev-mode on-demand compilation makes
        // the first hit to every route take seconds and would show up as
        // timeouts and bogus layout-shift readings.
        command: `./node_modules/.bin/next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        /**
         * Never reuse by default, in CI or locally. Reuse saves a build but
         * silently tests whatever happens to own the port — including another
         * project's server. Opt in with E2E_REUSE_SERVER=1 when you knowingly
         * have *this* app already running.
         */
        reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
