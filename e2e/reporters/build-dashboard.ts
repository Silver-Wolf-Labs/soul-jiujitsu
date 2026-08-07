#!/usr/bin/env npx tsx
/**
 * Builds the GitHub Pages dashboard published after every nightly run.
 *
 * Usage:
 *   npx tsx e2e/reporters/build-dashboard.ts <output-dir>
 *
 * Inputs:
 *   e2e/.artifacts/summary.json          this run's result (from nightly-reporter)
 *   <output-dir>/history.json            previous runs, if the Pages branch had any
 *   <output-dir>/report/                 this run's Playwright HTML report
 *
 * Output:
 *   <output-dir>/index.html              the dashboard
 *   <output-dir>/history.json            history with this run appended
 *
 * Why a dashboard on top of the HTML report: Playwright's report answers "what
 * failed in this run". The question a team actually asks each morning is "is it
 * still broken, and since when" — which needs history. This gives both: the
 * trend at the top, one click through to the full trace-enabled report.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Kept in sync with the shape written by nightly-reporter.ts. */
interface RunSummary {
  outcome: string;
  startedAt: string;
  durationMs: number;
  counts: { total: number; passed: number; failed: number; flaky: number; skipped: number };
  skippedReasons: string[];
  failures: {
    title: string;
    area: string;
    project: string;
    file: string;
    line: number;
    headline: string;
    detail: string;
    flaky: boolean;
  }[];
  byArea: Record<string, { passed: number; failed: number; flaky: number; skipped: number }>;
  env: { baseUrl: string; commit: string; branch: string; runUrl: string | null };
}

interface HistoryEntry {
  startedAt: string;
  commit: string;
  runUrl: string | null;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  /** Failure headlines, so history shows *what* was broken, not just that it was. */
  failureTitles: string[];
}

/** Keep 60 nights — two months of trend is enough to spot a slow regression. */
const HISTORY_LIMIT = 60;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function loadHistory(path: string): HistoryEntry[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt history file must not break the dashboard — start fresh rather
    // than failing the workflow over a reporting artifact.
    console.warn("[build-dashboard] history.json was unreadable; starting a new history.");
    return [];
  }
}

function statusOf(entry: { failed: number; flaky: number }): "pass" | "flaky" | "fail" {
  if (entry.failed > 0) return "fail";
  if (entry.flaky > 0) return "flaky";
  return "pass";
}

/**
 * How many consecutive runs (most recent first) have been failing. Answers the
 * "since when" question directly on the dashboard.
 */
function consecutiveFailures(history: HistoryEntry[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].failed > 0) count += 1;
    else break;
  }
  return count;
}

function renderSparkline(history: HistoryEntry[]): string {
  const recent = history.slice(-30);
  if (recent.length === 0) return '<p class="muted">No history yet — this is the first run.</p>';

  return `<div class="sparkline">${recent
    .map((entry) => {
      const status = statusOf(entry);
      const label = `${formatDate(entry.startedAt)} — ${entry.passed} passed, ${entry.failed} failed`;
      const link = entry.runUrl
        ? `<a class="bar ${status}" href="${escapeHtml(entry.runUrl)}" title="${escapeHtml(label)}"></a>`
        : `<span class="bar ${status}" title="${escapeHtml(label)}"></span>`;
      return link;
    })
    .join("")}</div>`;
}

function renderAreaTable(summary: RunSummary): string {
  const rows = Object.entries(summary.byArea)
    .sort()
    .map(([area, stats]) => {
      const status = statusOf(stats);
      return `<tr class="${status}">
        <td><span class="dot ${status}"></span>${escapeHtml(area)}</td>
        <td class="num">${stats.passed}</td>
        <td class="num">${stats.failed}</td>
        <td class="num">${stats.flaky}</td>
        <td class="num">${stats.skipped}</td>
      </tr>`;
    })
    .join("\n");

  return `<table>
    <thead><tr><th>Area</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Flaky</th><th class="num">Skipped</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderFailures(summary: RunSummary): string {
  const real = summary.failures.filter((f) => !f.flaky);
  if (real.length === 0) {
    return '<p class="ok">Nothing failed in this run.</p>';
  }

  // Grouped by area so a total outage reads as one problem rather than 30.
  const grouped = new Map<string, typeof real>();
  for (const failure of real) {
    const list = grouped.get(failure.area) ?? [];
    list.push(failure);
    grouped.set(failure.area, list);
  }

  return [...grouped.entries()]
    .sort()
    .map(
      ([area, group]) => `<h3>${escapeHtml(area)} <span class="muted">(${group.length})</span></h3>
      ${group
        .map(
          (failure) => `<details class="failure">
            <summary>
              <strong>${escapeHtml(failure.title)}</strong>
              <code class="project">${escapeHtml(failure.project)}</code>
            </summary>
            <p class="loc"><code>${escapeHtml(failure.file)}:${failure.line}</code></p>
            <pre>${escapeHtml(failure.detail)}</pre>
          </details>`
        )
        .join("\n")}`
    )
    .join("\n");
}

function renderHistoryTable(history: HistoryEntry[]): string {
  const recent = [...history].reverse().slice(0, 20);
  if (recent.length === 0) return "";

  const rows = recent
    .map((entry) => {
      const status = statusOf(entry);
      const when = entry.runUrl
        ? `<a href="${escapeHtml(entry.runUrl)}">${formatDate(entry.startedAt)}</a>`
        : formatDate(entry.startedAt);
      const what =
        entry.failureTitles.length > 0
          ? escapeHtml(entry.failureTitles.slice(0, 3).join("; ")) +
            (entry.failureTitles.length > 3 ? ` (+${entry.failureTitles.length - 3} more)` : "")
          : "—";
      return `<tr>
        <td><span class="dot ${status}"></span>${when}</td>
        <td><code>${escapeHtml(entry.commit.slice(0, 7))}</code></td>
        <td class="num">${entry.passed}</td>
        <td class="num">${entry.failed}</td>
        <td class="failures-cell">${what}</td>
      </tr>`;
    })
    .join("\n");

  return `<h2>Recent runs</h2>
  <table>
    <thead><tr><th>When</th><th>Commit</th><th class="num">Passed</th><th class="num">Failed</th><th>Failures</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderHtml(summary: RunSummary, history: HistoryEntry[]): string {
  const status = statusOf(summary.counts);
  const streak = consecutiveFailures(history);

  const headline =
    status === "fail"
      ? `${summary.counts.failed} test${summary.counts.failed === 1 ? "" : "s"} failing`
      : status === "flaky"
        ? `All passing — ${summary.counts.flaky} flaky`
        : "All passing";

  const streakNote =
    streak > 1
      ? `<p class="streak">Failing for ${streak} consecutive nights.</p>`
      : "";

  const skipNote =
    summary.skippedReasons.length > 0
      ? `<div class="panel">
          <h2>Not checked</h2>
          <p class="muted">These suites did not run, so a green result does not cover them.</p>
          <ul>${summary.skippedReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
        </div>`
      : "";

  const minutes = Math.floor(summary.durationMs / 60_000);
  const seconds = Math.round((summary.durationMs % 60_000) / 1_000);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Soul Jiu-Jitsu — Nightly UI tests</title>
<style>
  /* Self-contained: GitHub Pages serves this as a static file with no build
     step, so no external CSS or fonts. Dark-mode aware via prefers-color-scheme
     because these get opened on a phone at 8am. */
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #6b7280; --line: #e5e7eb;
    --panel: #f9fafb; --pass: #16a34a; --fail: #dc2626; --flaky: #d97706;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117; --fg: #e6edf3; --muted: #8b949e; --line: #30363d;
      --panel: #161b22; --pass: #3fb950; --fail: #f85149; --flaky: #d29922;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem 4rem;
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--bg); color: var(--fg);
  }
  .wrap { max-width: 60rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 .75rem; }
  h3 { font-size: .95rem; margin: 1.5rem 0 .5rem; }
  .muted { color: var(--muted); }
  .verdict { display: flex; align-items: center; gap: .6rem; font-size: 1.75rem; font-weight: 650; margin: .5rem 0; }
  .verdict.pass { color: var(--pass); } .verdict.fail { color: var(--fail); } .verdict.flaky { color: var(--flaky); }
  .meta { color: var(--muted); font-size: .875rem; }
  .meta code { background: var(--panel); padding: .1rem .35rem; border-radius: 3px; }
  .streak { color: var(--fail); font-weight: 600; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 1rem 1.25rem; margin: 1.5rem 0; }
  .counts { display: flex; flex-wrap: wrap; gap: 1.5rem; margin: 1rem 0 0; padding: 0; list-style: none; }
  .counts li { font-size: .875rem; color: var(--muted); }
  .counts b { display: block; font-size: 1.5rem; color: var(--fg); font-weight: 650; }
  table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--line); }
  th { font-weight: 600; color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .dot { display: inline-block; width: .5rem; height: .5rem; border-radius: 50%; margin-right: .5rem; vertical-align: middle; }
  .dot.pass { background: var(--pass); } .dot.fail { background: var(--fail); } .dot.flaky { background: var(--flaky); }
  .sparkline { display: flex; gap: 2px; align-items: flex-end; height: 2.5rem; margin: .5rem 0 0; }
  .bar { flex: 1; min-width: 4px; height: 100%; border-radius: 2px; display: block; text-decoration: none; }
  .bar.pass { background: var(--pass); } .bar.fail { background: var(--fail); } .bar.flaky { background: var(--flaky); }
  details.failure { border: 1px solid var(--line); border-radius: 6px; margin: .5rem 0; background: var(--panel); }
  details.failure summary { cursor: pointer; padding: .65rem .85rem; display: flex; gap: .6rem; align-items: baseline; flex-wrap: wrap; }
  details.failure[open] summary { border-bottom: 1px solid var(--line); }
  .project { font-size: .75rem; color: var(--muted); }
  .loc { margin: .65rem .85rem 0; font-size: .8rem; }
  pre { margin: .5rem .85rem .85rem; padding: .75rem; background: var(--bg); border: 1px solid var(--line);
        border-radius: 4px; overflow-x: auto; font-size: .8rem; white-space: pre-wrap; word-break: break-word; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
  .ok { color: var(--pass); font-weight: 550; }
  .actions { display: flex; gap: .75rem; flex-wrap: wrap; margin: 1.25rem 0; }
  .actions a { display: inline-block; padding: .5rem .9rem; border: 1px solid var(--line); border-radius: 6px;
               text-decoration: none; color: var(--fg); background: var(--panel); font-size: .875rem; font-weight: 550; }
  .actions a:hover { border-color: var(--muted); }
  .failures-cell { color: var(--muted); font-size: .8rem; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Soul Jiu-Jitsu — Nightly UI tests</h1>
  <div class="verdict ${status}">
    <span class="dot ${status}" style="width:.85rem;height:.85rem"></span>${escapeHtml(headline)}
  </div>
  ${streakNote}
  <p class="meta">
    ${formatDate(summary.startedAt)} · ${minutes}m ${seconds}s ·
    target <code>${escapeHtml(summary.env.baseUrl)}</code> ·
    commit <code>${escapeHtml(summary.env.commit.slice(0, 7))}</code>
  </p>

  <ul class="counts">
    <li><b>${summary.counts.passed}</b>passed</li>
    <li><b>${summary.counts.failed}</b>failed</li>
    <li><b>${summary.counts.flaky}</b>flaky</li>
    <li><b>${summary.counts.skipped}</b>skipped</li>
  </ul>

  <div class="actions">
    <a href="./report/index.html">Full report (screenshots &amp; traces) →</a>
    ${summary.env.runUrl ? `<a href="${escapeHtml(summary.env.runUrl)}">GitHub Actions run →</a>` : ""}
  </div>

  <div class="panel">
    <h2 style="margin-top:0">Trend — last 30 nights</h2>
    ${renderSparkline(history)}
    <p class="muted" style="font-size:.8rem;margin:.5rem 0 0">Oldest on the left. Click a bar to open that run.</p>
  </div>

  <h2>By area</h2>
  ${renderAreaTable(summary)}

  <h2>What broke</h2>
  ${renderFailures(summary)}

  ${skipNote}

  ${renderHistoryTable(history)}
</div>
</body>
</html>
`;
}

function main(): void {
  const outputDir = resolve(process.argv[2] ?? "e2e/.artifacts/dashboard");
  const summaryPath = resolve("e2e/.artifacts/summary.json");

  if (!existsSync(summaryPath)) {
    console.error(
      `[build-dashboard] ${summaryPath} not found. The Playwright run must complete ` +
        `(even failing) before the dashboard can be built.`
    );
    process.exit(1);
  }

  const summary: RunSummary = JSON.parse(readFileSync(summaryPath, "utf8"));

  mkdirSync(outputDir, { recursive: true });

  const historyPath = join(outputDir, "history.json");
  const history = loadHistory(historyPath);

  // Idempotency: re-running the dashboard build for the same run (a retried
  // workflow step) must not double-count the night in history.
  const alreadyRecorded = history.some(
    (entry) => entry.startedAt === summary.startedAt && entry.commit === summary.env.commit
  );

  if (!alreadyRecorded) {
    history.push({
      startedAt: summary.startedAt,
      commit: summary.env.commit,
      runUrl: summary.env.runUrl,
      passed: summary.counts.passed,
      failed: summary.counts.failed,
      flaky: summary.counts.flaky,
      skipped: summary.counts.skipped,
      failureTitles: summary.failures.filter((f) => !f.flaky).map((f) => f.title),
    });
  }

  const trimmed = history.slice(-HISTORY_LIMIT);

  writeFileSync(historyPath, JSON.stringify(trimmed, null, 2), "utf8");
  writeFileSync(join(outputDir, "index.html"), renderHtml(summary, trimmed), "utf8");

  console.log(
    `[build-dashboard] wrote ${join(outputDir, "index.html")} ` +
      `(${trimmed.length} run${trimmed.length === 1 ? "" : "s"} in history)`
  );
}

main();
