/**
 * CloudWatch RUM (Real User Monitoring) initializer.
 *
 * Loads the `aws-rum-web` agent once per page and configures it from
 * public env vars set in Amplify Hosting. The agent captures:
 *   - Uncaught JS errors (with stack traces)
 *   - HTTP request failures (4xx / 5xx responses)
 *   - Core Web Vitals (LCP, INP, CLS) — the CloudWatch RUM dashboard
 *     plots these as percentiles automatically
 *
 * Safe no-op in dev / when env vars are unset (the four `NEXT_PUBLIC_CW_RUM_*`
 * vars). This keeps local dev friction-free — nobody needs an RUM
 * monitor to run `npm run dev`.
 *
 * Notes:
 *   - Session sample rate is 1.0 at current scale. If traffic grows past
 *     ~10k sessions/day, drop to 0.25 to cap RUM cost.
 *   - `allowCookies: true` lets RUM correlate a session across page
 *     loads (better debugging). No PII is stored — just a UUID.
 *   - `telemetries: ["errors", "http", "performance"]` excludes
 *     interaction replays (those would capture form keystrokes =
 *     PII leak). Don't add "interaction" without a redaction policy.
 */

"use client";

import { useEffect } from "react";

// Minimal interface for the RUM constructor so we don't import the
// whole `aws-rum-web` type surface at build time (the package is loaded
// dynamically to avoid SSR bundle bloat — it's ~50 KB and only needed
// in the browser).
type AwsRumCtor = new (
  appMonitorId: string,
  version: string,
  region: string,
  config: {
    sessionSampleRate: number;
    guestRoleArn?: string;
    identityPoolId?: string;
    endpoint: string;
    telemetries: string[];
    allowCookies: boolean;
    enableXRay: boolean;
  }
) => unknown;

export function RumInit() {
  useEffect(() => {
    const appMonitorId = process.env.NEXT_PUBLIC_CW_RUM_APP_ID;
    const region = process.env.NEXT_PUBLIC_CW_RUM_REGION;
    const guestRoleArn = process.env.NEXT_PUBLIC_CW_RUM_GUEST_ROLE_ARN;
    const identityPoolId = process.env.NEXT_PUBLIC_CW_RUM_IDENTITY_POOL_ID;

    // All four must be set for RUM to function. Missing any → no-op.
    // Keeps dev / preview environments clean without console noise.
    if (!appMonitorId || !region || !guestRoleArn || !identityPoolId) {
      return;
    }

    // Dynamic import — aws-rum-web is ~50 KB and only loads when the
    // monitor is configured. Local dev + preview environments pay zero.
    let disposed = false;
    (async () => {
      try {
        const mod = await import("aws-rum-web");
        if (disposed) return;
        const AwsRum = (mod as unknown as { AwsRum: AwsRumCtor }).AwsRum;
        new AwsRum(appMonitorId, "1.0.0", region, {
          sessionSampleRate: 1.0,
          guestRoleArn,
          identityPoolId,
          endpoint: `https://dataplane.rum.${region}.amazonaws.com`,
          telemetries: ["errors", "http", "performance"],
          allowCookies: true,
          enableXRay: false,
        });
      } catch (err) {
        // RUM init failure is never user-visible. Log once and move on;
        // the app keeps working, we just lose client telemetry for this
        // session.
        // eslint-disable-next-line no-console
        console.warn("[rum] init failed:", err);
      }
    })();

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
