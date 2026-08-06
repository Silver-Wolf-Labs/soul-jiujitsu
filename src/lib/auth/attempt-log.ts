/**
 * Auth attempt logger — writes every login / signup / password-reset
 * attempt to the `auth_attempt_log` table. Drives two downstream features:
 *
 *   1. Failed-login alerting — if 5 attempts for the same email fail in
 *      15 min, we email the account owner ("someone's trying to log into
 *      your account").
 *   2. New-device login notification — on SUCCESSFUL auth, if the
 *      (email, IP, user-agent) tuple is new for this account, email
 *      the account owner ("new sign-in detected").
 *
 * The table lives server-side only (service-role RLS). All writes go
 * through this module so the policy is consistent.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";

export type FailureCode =
  | "bad_password"
  | "no_user"
  | "rate_limited"
  | "mfa_failed"
  | "breached_password"
  | "unverified_email"
  | "other";

interface AttemptRecord {
  email: string;
  ip: string | null;
  userAgent: string | null;
  ok: boolean;
  failureCode?: FailureCode;
}

/**
 * Log one attempt. Never throws — if the write fails, we log the error
 * to CloudWatch but don't block the auth flow.
 */
export async function recordAuthAttempt(record: AttemptRecord): Promise<void> {
  try {
    const svc = createServiceClient();
    const { error } = await svc.from("auth_attempt_log").insert({
      email: record.email.toLowerCase().trim(),
      ip: record.ip,
      user_agent: record.userAgent,
      ok: record.ok,
      failure_code: record.ok ? null : (record.failureCode ?? "other"),
    });
    if (error) {
      log.warn("auth-attempt-log: write failed", { err: error.message });
    }
  } catch (err) {
    log.warn("auth-attempt-log: exception", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Count failed attempts for `email` in the last `windowMin` minutes.
 * Used by the alert trigger: if count ≥ 5 after a fresh failure, send
 * the "someone's trying to access your account" email.
 */
export async function countRecentFailures(
  email: string,
  windowMin = 15
): Promise<number> {
  try {
    const svc = createServiceClient();
    const cutoff = new Date(Date.now() - windowMin * 60_000).toISOString();
    const { count, error } = await svc
      .from("auth_attempt_log")
      .select("*", { count: "exact", head: true })
      .eq("ok", false)
      .ilike("email", email.toLowerCase().trim())
      .gte("attempted_at", cutoff);
    if (error) {
      log.warn("auth-attempt-log: count failed", { err: error.message });
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    log.warn("auth-attempt-log: count exception", {
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * True if the (email, ip, user-agent) triple hasn't been seen before as
 * a successful login. Used to trigger the "new sign-in" notification.
 * "New" is bounded to the last 90 days — if the member hasn't logged in
 * from this device for 90+ days, that's worth a fresh heads-up.
 */
export async function isNewDeviceLogin(
  email: string,
  ip: string | null,
  userAgent: string | null
): Promise<boolean> {
  if (!ip || !userAgent) return false; // can't compare without the tuple
  try {
    const svc = createServiceClient();
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString();
    const { count, error } = await svc
      .from("auth_attempt_log")
      .select("*", { count: "exact", head: true })
      .eq("ok", true)
      .ilike("email", email.toLowerCase().trim())
      .eq("ip", ip)
      .eq("user_agent", userAgent)
      .gte("attempted_at", cutoff);
    if (error) return false;
    // Count = 0 → no prior success from this tuple in the last 90d → new.
    // Count ≥ 1 → known; don't re-notify (we already emailed them the
    // first time).
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}
