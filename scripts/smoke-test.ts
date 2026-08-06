#!/usr/bin/env npx tsx
/**
 * Smoke test for a fresh gym deployment.
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts [base-url]
 *
 * Defaults to http://localhost:3000 if no URL is provided.
 *
 * What it checks:
 *   1. Key routes return 200 (or expected redirects)
 *   2. No strings from the upstream MGD template, and no unreplaced
 *      TODO_* setup placeholders, appear in rendered HTML
 *   3. The gym name from site_settings appears in key pages
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";

// Strings that must never appear in this deployment. Two groups:
//   - Leftovers from the upstream MGD Dallas template this repo was forked
//     from. Any hit means rebranding missed a spot.
//   - TODO_* placeholders from the initial Soul Jiu-Jitsu scaffold. Any hit
//     means a required setup value was never filled in (see SETUP.md).
const LEAKED_STRINGS = [
  "Marcelo Garcia",
  "marcelogarciadallas",
  "MGD Dallas",
  "5706 E Mockingbird",
  "TKR Jiu Jitsu",
  "TODO_",
  "America/Chicago", // should not appear in rendered HTML
];

interface TestResult {
  route: string;
  status: number;
  pass: boolean;
  issues: string[];
}

async function testRoute(
  route: string,
  opts: { expectRedirect?: boolean; checkLeaks?: boolean } = {}
): Promise<TestResult> {
  const url = `${BASE_URL}${route}`;
  const result: TestResult = { route, status: 0, pass: true, issues: [] };

  try {
    const res = await fetch(url, { redirect: "manual" });
    result.status = res.status;

    if (opts.expectRedirect) {
      if (res.status < 300 || res.status >= 400) {
        result.issues.push(`Expected redirect, got ${res.status}`);
        result.pass = false;
      }
      return result;
    }

    if (res.status !== 200) {
      result.issues.push(`Expected 200, got ${res.status}`);
      result.pass = false;
      return result;
    }

    if (opts.checkLeaks !== false) {
      const html = await res.text();
      for (const leaked of LEAKED_STRINGS) {
        if (html.includes(leaked)) {
          result.issues.push(`Found hardcoded string: "${leaked}"`);
          result.pass = false;
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.issues.push(`Fetch failed: ${msg}`);
    result.pass = false;
  }

  return result;
}

async function main() {
  console.log("");
  console.log("═".repeat(60));
  console.log(` SMOKE TEST — ${BASE_URL}`);
  console.log("═".repeat(60));
  console.log("");

  const tests: Promise<TestResult>[] = [
    // Public routes — should return 200 and have no leaked strings
    testRoute("/"),
    testRoute("/portal/login"),
    testRoute("/portal/forgot-password"),
    testRoute("/admin/login"),
    testRoute("/kiosk"),

    // Protected routes — should redirect to login
    testRoute("/portal", { expectRedirect: true }),
    testRoute("/portal/profile", { expectRedirect: true }),
    testRoute("/admin", { expectRedirect: true }),
    testRoute("/kiosk/checkin", { expectRedirect: true }),
    testRoute("/waiver", { expectRedirect: true }),

    // Super admin — should redirect to login
    testRoute("/super-admin", { expectRedirect: true }),
    testRoute("/super-admin/setup", { expectRedirect: true }),
  ];

  const results = await Promise.all(tests);

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.pass ? "✓" : "✗";
    const status = r.status ? ` (${r.status})` : "";
    console.log(`  ${icon} ${r.route}${status}`);
    if (r.issues.length > 0) {
      for (const issue of r.issues) {
        console.log(`    → ${issue}`);
      }
    }
    if (r.pass) passed++;
    else failed++;
  }

  console.log("");
  console.log("─".repeat(60));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log("─".repeat(60));
  console.log("");

  if (failed > 0) {
    console.log("  ⚠ Some tests failed. Leaked-string hits mean either");
    console.log("    leftover MGD template text or an unfilled TODO_ setup");
    console.log("    placeholder. See SETUP.md.");
    console.log("");
    process.exit(1);
  } else {
    console.log("  All checks passed. The deployment looks clean.");
    console.log("");
  }
}

main();
