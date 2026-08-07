import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import type { Result as AxeResult } from "axe-core";

/**
 * axe-core accessibility scanning.
 *
 * Two tiers, on purpose:
 *
 *   `scanForViolations` (blocking)  — WCAG 2.1 A/AA rules that are unambiguous
 *       machine-checkable failures: missing form labels, images without alt
 *       text, colour contrast, invalid ARIA. These fail the nightly.
 *
 *   `scanAdvisory` (non-blocking)  — best-practice rules that are real
 *       improvements but where axe produces judgement calls (heading order in
 *       a design-led landing page, landmark structure). Reported as annotations
 *       so the team sees them without the nightly going red on taste.
 *
 * Splitting them is what keeps the nightly trustworthy: a report that is red
 * for a debatable heading-order finding stops being read.
 */

/** WCAG tags treated as blocking failures. */
const BLOCKING_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Best-practice tags surfaced as advisory only. */
const ADVISORY_TAGS = ["best-practice"];

/**
 * Pre-existing, site-wide accessibility debt.
 *
 * These are REAL violations, not false positives. They are listed here so the
 * nightly reports each one ONCE — as a tracked known issue — instead of failing
 * the same rule on every page it appears on. Nine identical failures for one
 * root cause is the fastest way to make a report unreadable.
 *
 * Rules:
 *   - Anything in here still appears in every run's report, under "Known a11y
 *     debt". It is not silenced, only de-duplicated.
 *   - `expires` is a hard stop: past that date the rule goes back to blocking
 *     and the nightly fails. This list cannot quietly become permanent.
 *   - A rule appearing on a page NOT listed in `pages` still fails, so new
 *     instances of an old bug are caught.
 *
 * Remove an entry when it is fixed — `a11y/accessibility.spec.ts` fails if a
 * listed rule no longer fires anywhere, so this list cannot go stale either.
 */
export interface KnownA11yIssue {
  /** axe rule id. */
  rule: string;
  /** Why it is not blocking today, and what fixing it involves. */
  reason: string;
  /** Routes where it is currently accepted. */
  pages: string[];
  /** ISO date after which this becomes blocking again. */
  expires: string;
}

export const KNOWN_A11Y_ISSUES: KnownA11yIssue[] = [
  {
    rule: "meta-viewport",
    reason:
      "src/app/layout.tsx sets `maximumScale: 1, userScalable: false` globally. " +
      "That is deliberate for the front-desk kiosk (pinch-zoom on a shared tablet " +
      "leaves the next member with a zoomed screen) but it is applied site-wide, so " +
      "it also blocks zoom for low-vision visitors on the public site — a WCAG 1.4.4 " +
      "failure. Fix: drop the restriction from the root layout and re-apply it only " +
      "in src/app/kiosk/layout.tsx via a route-segment `viewport` export.",
    pages: [
      "/",
      "/portal/login",
      "/portal/forgot-password",
      "/admin/login",
      "/kiosk",
      "/join",
      "/privacy",
      "/terms",
      "/super-admin/login",
    ],
    expires: "2026-11-01",
  },
  {
    rule: "color-contrast",
    reason:
      "Low-opacity white text on the dark kiosk/super-admin backgrounds " +
      "(`text-white/20`, `text-white/40`) and some muted greys on the landing page " +
      "fall below 4.5:1. Fix: raise the opacity steps used for body-sized text.",
    pages: ["/", "/kiosk", "/super-admin/login"],
    expires: "2026-11-01",
  },
];

/** Is this finding a known, still-unexpired issue on this page? */
function isKnown(finding: A11yFinding, route: string): KnownA11yIssue | undefined {
  return KNOWN_A11Y_ISSUES.find(
    (known) =>
      known.rule === finding.id &&
      known.pages.includes(route) &&
      new Date(known.expires) > new Date()
  );
}

export interface A11yFinding {
  id: string;
  impact: string;
  help: string;
  helpUrl: string;
  /** CSS selectors of the offending nodes, capped for readability. */
  targets: string[];
}

function toFindings(violations: AxeResult[]): A11yFinding[] {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? "unknown",
    help: v.help,
    helpUrl: v.helpUrl,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
}

export function formatFindings(findings: A11yFinding[]): string {
  if (findings.length === 0) return "none";
  return findings
    .map(
      (f, i) =>
        `  ${i + 1}. [${f.impact}] ${f.id} — ${f.help}\n` +
        `       nodes: ${f.targets.join(", ")}\n` +
        `       docs:  ${f.helpUrl}`
    )
    .join("\n");
}

function builder(page: Page, tags: string[]) {
  return (
    new AxeBuilder({ page })
      .withTags(tags)
      // The Stripe checkout iframe and the Google Maps embed are third-party
      // documents we cannot fix and do not control. Scanning them produces
      // findings no one can action.
      .exclude("iframe[src*='stripe.com']")
      .exclude("iframe[src*='google.com']")
      .exclude("iframe[src*='maps.google']")
  );
}

export interface ScanResult {
  /** Violations that failed the test. */
  blocking: A11yFinding[];
  /** Violations matched against KNOWN_A11Y_ISSUES — reported, not failed. */
  known: A11yFinding[];
}

/**
 * Run the blocking scan. Fails the test on any WCAG A/AA violation that is not
 * tracked in `KNOWN_A11Y_ISSUES`, with the full finding list (rule, impact,
 * offending selectors, docs link) in the failure message so the nightly report
 * is actionable without opening a trace.
 *
 * @param route The route path, matched against the known-issues list. Pass the
 *   path (`/kiosk`), not the human label, or nothing will match.
 */
export async function scanForViolations(
  page: Page,
  context: string,
  route?: string
): Promise<ScanResult> {
  const results = await builder(page, BLOCKING_TAGS).analyze();
  const findings = toFindings(results.violations);

  const path = route ?? new URL(page.url()).pathname;

  const known: A11yFinding[] = [];
  const blocking: A11yFinding[] = [];
  for (const finding of findings) {
    if (isKnown(finding, path)) known.push(finding);
    else blocking.push(finding);
  }

  const knownNote =
    known.length > 0
      ? `\n\n(${known.length} further violation(s) on this page are tracked in ` +
        `KNOWN_A11Y_ISSUES and did not fail this test: ${known.map((k) => k.id).join(", ")})`
      : "";

  expect(
    blocking,
    `${blocking.length} WCAG A/AA accessibility violation(s) on ${context}:\n` +
      `${formatFindings(blocking)}${knownNote}`
  ).toHaveLength(0);

  return { blocking, known };
}

/**
 * Raw blocking-tier scan with no known-issue filtering and no assertion. Used by
 * the staleness guard, which needs to know what axe actually reports rather than
 * what we currently accept.
 */
export async function scanRaw(page: Page): Promise<A11yFinding[]> {
  const results = await builder(page, BLOCKING_TAGS).analyze();
  return toFindings(results.violations);
}

/**
 * Run the advisory scan. Never fails; returns findings so the caller can attach
 * them to the test report.
 */
export async function scanAdvisory(page: Page): Promise<A11yFinding[]> {
  const results = await builder(page, ADVISORY_TAGS).analyze();
  return toFindings(results.violations);
}
