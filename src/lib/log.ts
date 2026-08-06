/**
 * Structured JSON logger for Amplify Hosting / CloudWatch.
 *
 * Every log line is a single-line JSON object that CloudWatch Logs
 * Insights can query natively:
 *
 *   fields @timestamp, level, msg, requestId, ctx.memberId
 *     | filter level = "error"
 *     | sort @timestamp desc
 *
 * Critical: we emit via `console.log` / `console.error` (not
 * `process.stdout.write`). Amplify Hosting runs Next.js SSR on Lambda,
 * and Lambda's runtime forwards output to CloudWatch Logs through the
 * instrumented console hook. Direct writes to stdout can buffer or
 * interleave on cold paths.
 *
 * Log level is controlled by `LOG_LEVEL` env var (debug | info | warn |
 * error). Default: info. Set `LOG_LEVEL=debug` in Amplify env vars when
 * investigating; reset to info after.
 *
 * PII redaction is automatic for known-sensitive field names (email,
 * phone, stripe_customer_id, etc.). See `PII_KEYS`. Engineers should
 * log `memberId` / `userId` — never email or phone — as the join key
 * when correlating logs.
 */

import { getRequestId } from "./request-id";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const ACTIVE_LEVEL = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
const THRESHOLD = LEVEL_WEIGHT[ACTIVE_LEVEL] ?? LEVEL_WEIGHT.info;

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Keys whose values should be redacted before hitting CloudWatch. An
 * engineer will one day write `log.info({ email: user.email })` — we
 * want that to emit `email: "[REDACTED]"` rather than the member's
 * actual email. If you ever need to log an email (e.g. SES bounce
 * processing), log the suppression event with the domain-only:
 *   log.info("ses bounce", { domain: email.split("@")[1] })
 */
const PII_KEYS = new Set([
  "email",
  "phone",
  "phone_number",
  "emergency_contact_phone",
  "emergency_contact_name",
  "stripe_customer_id",
  "password",
  "access_token",
  "refresh_token",
  "api_key",
]);

function redactContext(ctx: LogContext | undefined): LogContext | undefined {
  if (!ctx) return ctx;
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = PII_KEYS.has(k) ? "[REDACTED]" : v;
  }
  return out;
}

function emit(level: Level, msg: string, ctx?: LogContext): void {
  if (LEVEL_WEIGHT[level] < THRESHOLD) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    requestId: getRequestId() ?? null,
    env: process.env.NODE_ENV,
    ...redactContext(ctx),
  };

  const payload = JSON.stringify(line);

  // Lambda forwards both console.log and console.error to CloudWatch.
  // Splitting by severity lets local dev (where stderr and stdout
  // often go to different panes) show warnings and errors separately.
  if (level === "error" || level === "warn") {
    console.error(payload);
  } else {
    console.log(payload);
  }
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit("info",  msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => emit("warn",  msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
};
