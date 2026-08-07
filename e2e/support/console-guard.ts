import type { ConsoleMessage, Page, Request, Response } from "@playwright/test";

/**
 * Collects browser-side problems that a normal assertion never sees: uncaught
 * exceptions, console errors, failed network requests, and CSP violations.
 *
 * This is the highest-value part of the framework for the user's stated goal
 * ("find bugs we haven't seen"). A page can render perfectly and still be
 * throwing a hydration mismatch or 404-ing an image on every load — that only
 * shows up here.
 */

export interface PageProblem {
  kind: "pageerror" | "console" | "requestfailed" | "http-error" | "csp";
  message: string;
  /** Where it happened, when the browser tells us. */
  location?: string;
}

/**
 * Noise we deliberately tolerate. Every entry needs a reason — an unexplained
 * ignore pattern is how a real bug gets permanently hidden.
 */
const IGNORED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    // CloudWatch RUM is initialised client-side (`src/lib/rum.tsx`) and has no
    // Cognito identity pool configured in test environments, so it fails its
    // guest-credentials call. Not a product bug.
    pattern: /cognito-identity|dataplane\.rum|aws-rum|rum\.amazonaws/i,
    reason: "CloudWatch RUM has no identity pool in test envs",
  },
  {
    // Chrome logs this for any resource blocked by an extension or by the
    // runner's network sandbox. Not attributable to the app.
    pattern: /net::ERR_BLOCKED_BY_CLIENT/,
    reason: "Runner/extension-level blocking, not app behaviour",
  },
  {
    // React DevTools nag, printed by React in development builds.
    pattern: /Download the React DevTools/i,
    reason: "React's own dev-tools suggestion",
  },
  {
    // Next's dev overlay and HMR chatter — only present when someone runs the
    // suite against `next dev` locally.
    pattern: /\[Fast Refresh\]|webpack-hmr|_next\/static\/development/i,
    reason: "Next dev-server HMR noise",
  },
];

function isIgnored(message: string): boolean {
  return IGNORED_PATTERNS.some(({ pattern }) => pattern.test(message));
}

/**
 * Requests whose failure is expected and not a product defect.
 */
function isIgnoredRequest(url: string): boolean {
  return (
    /cognito-identity|dataplane\.rum|sts\.[a-z0-9-]+\.amazonaws\.com/i.test(url) ||
    // Favicon 404s on a fresh deploy are cosmetic and reported separately by
    // the asset spec, which gives a clearer message than a generic 404.
    /favicon\.ico$/i.test(url)
  );
}

/**
 * Attach listeners to a page and return the (live) list of problems found.
 *
 * The array is mutated as events arrive, so read it *after* the interaction
 * you care about — typically at the end of a test.
 */
export function watchForProblems(page: Page): PageProblem[] {
  const problems: PageProblem[] = [];

  // Uncaught exceptions and unhandled rejections. Always a real bug.
  page.on("pageerror", (error: Error) => {
    const message = `${error.name}: ${error.message}`;
    if (isIgnored(message)) return;
    problems.push({
      kind: "pageerror",
      message,
      location: error.stack?.split("\n")[1]?.trim(),
    });
  });

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isIgnored(text)) return;

    // Browsers report a CSP violation as a console error. Splitting it into its
    // own kind matters because `next.config.mjs` builds the CSP by hand and a
    // typo there silently breaks Stripe or Supabase in production only.
    const kind = /Content Security Policy|Refused to (load|connect|execute)/i.test(text)
      ? "csp"
      : "console";

    const loc = msg.location();
    problems.push({
      kind,
      message: text,
      location: loc.url ? `${loc.url}:${loc.lineNumber}` : undefined,
    });
  });

  page.on("requestfailed", (request: Request) => {
    const url = request.url();
    if (isIgnoredRequest(url)) return;
    const failure = request.failure();
    // Playwright reports a navigation aborted by a redirect or by test teardown
    // as a failed request; those carry ERR_ABORTED and aren't product bugs.
    if (failure?.errorText === "net::ERR_ABORTED") return;
    problems.push({
      kind: "requestfailed",
      message: `${request.method()} ${url} — ${failure?.errorText ?? "unknown failure"}`,
    });
  });

  page.on("response", (response: Response) => {
    const status = response.status();
    // 4xx/5xx on a subresource. The *document* response is asserted separately
    // by each spec, so this catches broken images, missing fonts, and API calls
    // failing behind an otherwise-healthy page.
    if (status < 400) return;
    const url = response.url();
    if (isIgnoredRequest(url)) return;
    if (response.request().resourceType() === "document") return;
    problems.push({
      kind: "http-error",
      message: `${status} ${response.request().method()} ${url}`,
    });
  });

  return problems;
}

/** Render problems as a readable multi-line block for assertion messages. */
export function formatProblems(problems: PageProblem[]): string {
  if (problems.length === 0) return "none";
  return problems
    .map((p, i) => {
      const where = p.location ? `\n       at ${p.location}` : "";
      return `  ${i + 1}. [${p.kind}] ${p.message}${where}`;
    })
    .join("\n");
}
