import type { FullConfig } from "@playwright/test";

/**
 * Fails fast if the target origin is not this application.
 *
 * This exists because of a real incident while building the framework: an
 * unrelated project's `next start` was listening on port 3000, Playwright's
 * `reuseExistingServer` adopted it, and the suite spent a full run reporting
 * "authorization bugs" on routes that simply don't exist in that other app.
 * A nightly that can't tell "the app is broken" from "I tested the wrong app"
 * is worse than no nightly, so we check identity once, up front.
 *
 * The check is a set of routes that only this app has. It deliberately does
 * *not* assert on gym-specific copy — that comes from Supabase `site_settings`
 * and legitimately changes when the gym edits their content.
 */

/** Routes that must exist here. A 404 on any of them means wrong target. */
const FINGERPRINT_ROUTES = [
  "/super-admin/login",
  "/portal/login",
  "/admin/login",
  "/kiosk",
];

const TIMEOUT_MS = 30_000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.E2E_BASE_URL ??
    `http://localhost:${process.env.E2E_PORT || "3210"}`;

  const missing: string[] = [];

  for (const route of FINGERPRINT_ROUTES) {
    const url = new URL(route, baseURL).toString();
    let status: number;
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
    } catch (error) {
      throw new Error(
        `[e2e] Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}\n` +
          `The app under test is not responding. If you are pointing at a deploy, check E2E_BASE_URL.`
      );
    }
    if (status === 404) missing.push(`${route} → 404`);
  }

  if (missing.length > 0) {
    throw new Error(
      `[e2e] ${baseURL} does not look like the Soul Jiu-Jitsu app.\n\n` +
        `These routes should exist but returned 404:\n` +
        missing.map((m) => `  - ${m}`).join("\n") +
        `\n\nMost likely something else is listening on that port (another project's ` +
        `\`next start\`), or the build is stale. Aborting rather than reporting hundreds ` +
        `of bogus failures against the wrong application.\n` +
        `Fix: stop whatever owns the port, or set E2E_PORT / E2E_BASE_URL.`
    );
  }

  console.log(`[e2e] Verified target is this app: ${baseURL}`);
}
