# UI test framework

Playwright suite that runs against the whole app every night and reports what
broke. 382 tests across 13 files.

Its job is not only "did the build pass" — Vitest and `next build` already cover
that. It answers questions nothing else in this repo does:

- Does every route actually render for a real browser, or does it return 200 with
  an error boundary?
- Is every protected route still protected?
- Do the login / signup / check-in flows still work end to end?
- Does anything look broken at 320px, or on a tablet at the front desk?
- Are there console errors, failed requests, or CSP violations a user would hit?
- Are there accessibility failures that create legal exposure?
- Is placeholder content (`TODO_CITY`, MGD Dallas leftovers) visible in production?

---

## Quick start

```bash
npm ci
npm run test:e2e:install     # one-time: download browser binaries
npm run build                # the suite tests a production build, not `next dev`
npm run test:e2e
```

Playwright boots the server itself on **port 3210** and shuts it down after.

You need `.env.local` with real Supabase values, or the pages that read from
Supabase will render error states and the suite will (correctly) report them as
broken. `.env.local.example` documents what is required.

Node 22+ (`package.json` `engines`). On Node 21 or lower Vitest fails to start,
and `npm ci` warns.

### Useful subsets

```bash
npm run test:e2e:smoke              # routes + content integrity, ~40s — run this first
npm run test:e2e:a11y               # axe-core WCAG scans
npm run test:e2e:auth               # portal / admin / kiosk flows (needs credentials)
npm run test:e2e:ui                 # interactive time-travel debugger — best way to write a new test
npm run test:e2e:headed             # watch it drive a real browser
npm run test:e2e:report             # open the HTML report from the last run

npm run test:e2e -- --grep "mobile menu"          # one test by name
npm run test:e2e -- --project=chromium            # one browser
npm run test:e2e -- e2e/tests/functional          # one directory
```

### Pointing at a deployed URL instead

```bash
E2E_BASE_URL=https://staging.example.com npm run test:e2e
```

The local server is not started. This tests the real CDN, real headers and real
data — worth doing before a release, and available as a manual input on the
nightly workflow.

---

## Layout

```
e2e/
├── tests/
│   ├── smoke/         every route renders; no placeholder content leaks
│   ├── functional/    landing, navigation, forms, SEO, security headers
│   ├── layout/        responsive overflow, touch targets, CLS, page weight
│   ├── a11y/          axe-core WCAG 2.1 A/AA + keyboard + focus visibility
│   ├── authenticated/ portal, admin (28-route crawl), kiosk
│   └── visual/        screenshot diffs (opt-in, see below)
├── support/
│   ├── fixtures.ts       extends `test` with problem-detection
│   ├── console-guard.ts  page errors, failed requests, CSP violations
│   ├── a11y.ts           axe wrappers + tracked accessibility debt
│   ├── auth.ts           login helpers, credential gating
│   ├── routes.ts         the route inventory the specs iterate over
│   └── global-setup.ts   aborts if the target isn't this app
├── reporters/
│   ├── nightly-reporter.ts  GitHub Step Summary + summary.json
│   └── build-dashboard.ts   the GitHub Pages dashboard
└── snapshots/         committed visual baselines (Linux-generated)
```

`e2e/.artifacts/` is generated and gitignored. `e2e/snapshots/` **is** committed —
those are the visual baselines.

### Projects

`playwright.config.ts` splits by concern, not just by browser, so the nightly
report says which *class* of problem regressed:

| Project | Runs | Why |
|---|---|---|
| `chromium` | functional, smoke, layout | the main pass |
| `mobile-chrome` | same, at Pixel 7 | most members browse on a phone |
| `webkit` | smoke + layout only | Safari is the highest-risk engine here (dvh in the kiosk layout, sticky nav) but the slowest — a subset keeps the nightly under 45 min |
| `a11y` | axe scans | separate so an a11y regression is not buried in functional noise |
| `authenticated` | portal / admin / kiosk | skips itself cleanly when credentials are absent |
| `visual` | screenshot diffs | opt-in, `E2E_VISUAL=1` |

### No `data-testid`

There isn't a single `data-testid` in `src/`, and the specs deliberately don't add
any. Selectors use roles, accessible names, label text and `name` attributes —
so a selector breaking usually means an accessible name broke, which is itself a
bug worth failing on. It also means the tests can't drift away from what a user
or a screen reader actually sees.

---

## The nightly workflow

`.github/workflows/nightly-ui-tests.yml`, cron `7 8 * * *` — 02:00 America/Chicago
(03:00 during DST; GitHub does not adjust for it). Chosen to finish before the gym
opens and to avoid the 03:00 UTC cron in `vercel.json`.

It builds the app in CI and tests localhost. `workflow_dispatch` accepts:

- `base_url` — test a deploy instead of building
- `visual` — include screenshot diffs
- `grep` — run a subset

### Reporting — three places, in order of usefulness

1. **Step Summary** on the run page. Written directly by `nightly-reporter.ts`.
   Failures are grouped **by area**, so a total outage reads as one problem rather
   than 30 separate ones. It also lists what was **skipped**, so a green run is
   never mistaken for full coverage.
2. **Dashboard on GitHub Pages** — the verdict, a 30-night sparkline, a
   "failing for N consecutive nights" streak counter, per-area breakdown, and a
   link into the full trace-enabled report. This is the "is it still broken, and
   since when" view. History lives in the Actions cache (60 nights).
3. **A tracking issue**, opened on the first failure and *updated* each night
   after that rather than opening a new one. It comments "Recovered" and closes
   itself when the suite goes green.

Artifacts on every run: `playwright-html-report` (screenshots, video,
step-by-step traces), `playwright-summary` (`summary.json`, `summary.md`,
`junit.xml`).

The `test` job uses `continue-on-error` so reporting always runs; a separate
`verdict` job carries the real pass/fail so the badge tells the truth.

### One-time setup

**Enable Pages:** Settings → Pages → Source: **GitHub Actions**. Until you do,
the dashboard job logs a warning and the workflow still passes — the HTML report
artifact is unaffected.

**Add secrets** under Settings → Secrets and variables → Actions:

| Secret | Required | Notes |
|---|---|---|
| `E2E_SUPABASE_URL` | **yes** | point at a **staging** project, not production — the authenticated specs sign in as a real user and the admin crawl reads real tables |
| `E2E_SUPABASE_ANON_KEY` | **yes** | |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | recommended | without it, server actions that need service role fail |
| `E2E_MEMBER_EMAIL` / `E2E_MEMBER_PASSWORD` | optional | a member with a signed waiver. Without these the portal specs skip |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | optional | `profiles.is_admin = true`. Without these the 28-route admin crawl skips |
| `E2E_KIOSK_PIN` | optional | the kiosk unlock flow skips without it |
| `E2E_SUPER_ADMIN_PASSWORD` | optional | matches `SUPER_ADMIN_PASSWORD` on the target |
| `E2E_STRIPE_SECRET_KEY` / `E2E_STRIPE_WEBHOOK_SECRET` | optional | absent keys only disable billing features; the suite accounts for that |

Missing optional secrets are **not** failures. Each suite skips itself and the
reason appears under "Not checked" in the report, so partial coverage is visible
rather than silently absent. Missing *required* secrets fail the run early with a
message naming which one.

The workflow never runs on push or PR — `ci.yml` covers that, and a 45-minute
browser suite on every commit would just get ignored.

---

## Visual regression

Off by default. Screenshot baselines are rendered with the platform's font stack,
so a baseline committed from macOS always fails on the Ubuntu runner.

Baselines must be generated **on Linux**. Trigger the workflow manually with
`visual: true` and download the `playwright-failure-artifacts` archive — the
`-actual.png` files in it are your baselines. Commit them under
`e2e/snapshots/visual/`.

Locally (macOS baselines are for your own use, don't commit them):

```bash
npm run test:e2e:update-snapshots
npm run test:e2e:visual
```

The specs mask regions driven by Supabase content (`#updates`, `#blog`,
`#instagram`, `#schedule`) so the gym editing their own site doesn't turn the
nightly red.

---

## Reading a failure

1. Open the Step Summary on the run page — it groups by area and usually names
   the cause outright.
2. Download `playwright-html-report`, unzip, `npx playwright show-report <dir>`.
   Screenshot at failure, video, and a step-by-step trace with DOM snapshots.
3. Reproduce: `npm run build && npm run test:e2e -- --grep "part of the name"`.

Assertion messages are written to be read half-awake and out of context — they
say what broke for a *user* and where to look, not just which matcher failed.
When you add a test, match that: `expect(x).toBe(y)` with no message is a test
that will waste someone's morning.

## Two things that will bite you

**Wrong-app runs.** `global-setup.ts` fetches four routes that only this app has
and aborts if any 404s. This exists because an unrelated project's `next start`
was on port 3000, `reuseExistingServer` adopted it, and a full run reported
"authorization bugs" on routes that app simply doesn't have. Hence port 3210 and
`reuseExistingServer` off unless you set `E2E_REUSE_SERVER=1`.

**Tracked accessibility debt.** `KNOWN_A11Y_ISSUES` in `support/a11y.ts` lists
real violations that are reported once instead of failing on all nine pages they
appear on. They are **not** silenced — they show in every report, and each entry
has an `expires` date after which the rule blocks again. A guard test fails if an
entry is fixed (delete it) or expired (fix it or consciously extend it), so the
list can neither go stale nor quietly become permanent.

Currently listed: `meta-viewport` (the root layout disables pinch-zoom site-wide;
correct for the shared kiosk tablet, a WCAG 1.4.4 failure for everyone else —
fix is to scope it to `src/app/kiosk/`) and `color-contrast` on the dark
kiosk/super-admin surfaces.
