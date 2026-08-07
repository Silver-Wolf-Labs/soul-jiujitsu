import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

/**
 * Custom Playwright reporter for the nightly run.
 *
 * Produces two things the built-in reporters do not:
 *
 *   1. A GitHub Actions **step summary** — the markdown block that appears on
 *      the run page itself. This is what Fabrizio and Daniel see first when the
 *      nightly fails, without downloading an artifact or opening a trace.
 *
 *   2. `summary.json` — machine-readable, consumed by the workflow to decide
 *      whether to open/close the tracking issue, and by the dashboard builder to
 *      append a history entry.
 *
 * Design choice: failures are grouped by *area* (derived from the spec's
 * directory) rather than listed flat. A nightly that fails 30 tests because the
 * Supabase project is down should read as "all areas down", not as 30 unrelated
 * bugs to triage.
 */

/** Area labels, keyed by the directory under e2e/tests/. */
const AREA_LABELS: Record<string, string> = {
  smoke: "Smoke — routes & content",
  functional: "Functionality",
  layout: "Layout & responsive",
  a11y: "Accessibility",
  authenticated: "Authenticated flows",
  visual: "Visual regression",
};

interface FailureRecord {
  title: string;
  area: string;
  project: string;
  file: string;
  line: number;
  /** First meaningful line of the error — the assertion message. */
  headline: string;
  /** Full error text, truncated. */
  detail: string;
  durationMs: number;
  /** True when the test passed on a later attempt. */
  flaky: boolean;
}

interface RunSummary {
  outcome: FullResult["status"];
  startedAt: string;
  durationMs: number;
  counts: {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
  };
  /** Skipped suites and why — so "0 failures" is never mistaken for full coverage. */
  skippedReasons: string[];
  failures: FailureRecord[];
  byArea: Record<string, { passed: number; failed: number; flaky: number; skipped: number }>;
  env: {
    baseUrl: string;
    commit: string;
    branch: string;
    runUrl: string | null;
  };
}

const ARTIFACT_DIR = join(process.cwd(), "e2e", ".artifacts");

/** Strip ANSI colour codes — they render as garbage in markdown. */
function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

/** Cut a string to `max` chars on a line boundary where possible. */
function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastNewline = cut.lastIndexOf("\n");
  return (lastNewline > max * 0.6 ? cut.slice(0, lastNewline) : cut) + "\n… (truncated)";
}

function escapeTableCell(input: string): string {
  return input.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export default class NightlyReporter implements Reporter {
  private config!: FullConfig;
  private startedAt = new Date(0);
  private failures: FailureRecord[] = [];
  private skippedReasons = new Set<string>();
  private counts = { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 };
  private byArea: RunSummary["byArea"] = {};

  onBegin(config: FullConfig, _suite: Suite): void {
    this.config = config;
    this.startedAt = new Date();
  }

  /** Derive the area from a spec's path: e2e/tests/<area>/foo.spec.ts */
  private areaOf(test: TestCase): string {
    const rel = relative(join(process.cwd(), "e2e", "tests"), test.location.file);
    const dir = rel.split(/[/\\]/)[0];
    return AREA_LABELS[dir] ?? dir;
  }

  private bumpArea(area: string, key: keyof RunSummary["byArea"][string]): void {
    this.byArea[area] ??= { passed: 0, failed: 0, flaky: 0, skipped: 0 };
    this.byArea[area][key] += 1;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const area = this.areaOf(test);
    const outcome = test.outcome();

    // `onTestEnd` fires per attempt. Only count the final attempt so a retry does
    // not inflate the totals.
    const isFinalAttempt = result.retry === test.retries || result.status === "passed";
    if (!isFinalAttempt && outcome !== "flaky") return;

    this.counts.total += 1;

    switch (outcome) {
      case "expected":
        this.counts.passed += 1;
        this.bumpArea(area, "passed");
        return;

      case "skipped":
        this.counts.skipped += 1;
        this.bumpArea(area, "skipped");
        // Capture the skip reason so the report distinguishes "nothing broken"
        // from "we never checked". `test.skip(cond, reason)` lands in annotations.
        for (const annotation of test.annotations) {
          if (annotation.type === "skip" && annotation.description) {
            this.skippedReasons.add(annotation.description);
          }
        }
        return;

      case "flaky":
        this.counts.flaky += 1;
        this.bumpArea(area, "flaky");
        break;

      case "unexpected":
        this.counts.failed += 1;
        this.bumpArea(area, "failed");
        break;
    }

    const error = result.errors[0];
    const rawMessage = stripAnsi(error?.message ?? error?.stack ?? "No error message captured");

    // Playwright puts our custom assertion message on the first line(s), before
    // the "Expected/Received" block. That message is the part a human needs.
    const headline =
      rawMessage
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith("Error:")) ?? "Unknown failure";

    this.failures.push({
      title: test.titlePath().slice(1).filter(Boolean).join(" › "),
      area,
      project: test.parent.project()?.name ?? "unknown",
      file: relative(process.cwd(), test.location.file),
      line: test.location.line,
      headline: truncate(headline, 300),
      detail: truncate(rawMessage, 2_500),
      durationMs: result.duration,
      flaky: outcome === "flaky",
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const summary: RunSummary = {
      outcome: result.status,
      startedAt: this.startedAt.toISOString(),
      durationMs: Date.now() - this.startedAt.getTime(),
      counts: this.counts,
      skippedReasons: [...this.skippedReasons],
      failures: this.failures,
      byArea: this.byArea,
      env: {
        baseUrl:
          process.env.E2E_BASE_URL ||
          (this.config.projects[0]?.use?.baseURL as string) ||
          `http://localhost:${process.env.E2E_PORT || "3210"}`,
        commit: process.env.GITHUB_SHA ?? "local",
        branch: process.env.GITHUB_REF_NAME ?? "local",
        runUrl:
          process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
            ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
            : null,
      },
    };

    mkdirSync(ARTIFACT_DIR, { recursive: true });
    writeFileSync(join(ARTIFACT_DIR, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

    const markdown = this.renderMarkdown(summary);
    writeFileSync(join(ARTIFACT_DIR, "summary.md"), markdown, "utf8");

    // Append to the GitHub Actions step summary when running in CI. This is the
    // block that shows up directly on the workflow run page.
    const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummaryPath) {
      try {
        mkdirSync(dirname(stepSummaryPath), { recursive: true });
        appendFileSync(stepSummaryPath, markdown, "utf8");
      } catch (error) {
        // Never let a reporting failure mask the test result.
        console.error(`[nightly-reporter] could not write step summary: ${(error as Error).message}`);
      }
    }

    console.log(`\n[nightly-reporter] wrote ${join("e2e", ".artifacts", "summary.json")}`);
  }

  private renderMarkdown(summary: RunSummary): string {
    const { counts, failures, byArea, env } = summary;
    const lines: string[] = [];

    const icon = counts.failed > 0 ? "🔴" : counts.flaky > 0 ? "🟡" : "🟢";
    const verdict =
      counts.failed > 0
        ? `${counts.failed} test${counts.failed === 1 ? "" : "s"} failing`
        : counts.flaky > 0
          ? `all passing, ${counts.flaky} flaky`
          : "all passing";

    lines.push(`## ${icon} Nightly UI tests — ${verdict}`);
    lines.push("");

    const minutes = Math.floor(summary.durationMs / 60_000);
    const seconds = Math.round((summary.durationMs % 60_000) / 1_000);

    lines.push(
      `**${counts.passed} passed** · ` +
        `**${counts.failed} failed** · ` +
        `${counts.flaky} flaky · ` +
        `${counts.skipped} skipped — in ${minutes}m ${seconds}s`
    );
    lines.push("");
    lines.push(`Target: \`${env.baseUrl}\` · Commit: \`${env.commit.slice(0, 7)}\``);
    lines.push("");

    // ── Per-area table. Read this first: it says whether one thing broke or
    // everything did.
    lines.push("### By area");
    lines.push("");
    lines.push("| Area | Passed | Failed | Flaky | Skipped |");
    lines.push("| --- | --: | --: | --: | --: |");
    for (const [area, stats] of Object.entries(byArea).sort()) {
      const areaIcon = stats.failed > 0 ? "🔴" : stats.flaky > 0 ? "🟡" : "🟢";
      lines.push(
        `| ${areaIcon} ${area} | ${stats.passed} | ${stats.failed} | ${stats.flaky} | ${stats.skipped} |`
      );
    }
    lines.push("");

    // ── Failures, grouped by area, with the human-readable assertion message
    // front and centre.
    const realFailures = failures.filter((f) => !f.flaky);
    if (realFailures.length > 0) {
      lines.push("### What broke");
      lines.push("");

      const grouped = new Map<string, FailureRecord[]>();
      for (const failure of realFailures) {
        const list = grouped.get(failure.area) ?? [];
        list.push(failure);
        grouped.set(failure.area, list);
      }

      for (const [area, group] of [...grouped.entries()].sort()) {
        lines.push(`#### ${area} (${group.length})`);
        lines.push("");
        for (const failure of group) {
          lines.push(`<details><summary><b>${escapeTableCell(failure.title)}</b> — <code>${failure.project}</code></summary>`);
          lines.push("");
          lines.push(`\`${failure.file}:${failure.line}\``);
          lines.push("");
          lines.push("```");
          lines.push(failure.detail);
          lines.push("```");
          lines.push("");
          lines.push("</details>");
          lines.push("");
        }
      }
    }

    const flakyTests = failures.filter((f) => f.flaky);
    if (flakyTests.length > 0) {
      lines.push("### Flaky (passed on retry)");
      lines.push("");
      lines.push("These passed eventually, so they are not blocking — but they are unstable.");
      lines.push("");
      for (const failure of flakyTests) {
        lines.push(`- **${escapeTableCell(failure.title)}** — ${escapeTableCell(failure.headline)}`);
      }
      lines.push("");
    }

    // ── Skips. Making these prominent is deliberate: a green nightly that
    // skipped every authenticated suite is not the same as a healthy app, and
    // that distinction is easy to lose.
    if (summary.skippedReasons.length > 0) {
      lines.push("### Not checked");
      lines.push("");
      for (const reason of summary.skippedReasons) {
        lines.push(`- ${reason}`);
      }
      lines.push("");
    }

    if (realFailures.length > 0) {
      lines.push("---");
      lines.push("");
      lines.push(
        "**Debugging:** download the `playwright-html-report` artifact from this run " +
          "for screenshots, videos, and a full trace of each failure. Open it with " +
          "`npx playwright show-report <extracted-folder>`."
      );
      lines.push("");
    }

    return lines.join("\n") + "\n";
  }
}
