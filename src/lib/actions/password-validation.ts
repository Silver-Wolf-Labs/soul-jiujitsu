"use server";

/**
 * Pre-signup / pre-reset password validation server action.
 *
 * Runs two checks before Supabase Auth accepts a new or updated
 * password:
 *   1. Minimum length (10 chars). Prefer long over complex — "correct
 *      horse battery staple" is stronger than "P@ssw0rd!" and easier
 *      to remember. Length is the single most predictive factor of
 *      cracking difficulty.
 *   2. HaveIBeenPwned breach check. Any password that has appeared in
 *      a known breach is rejected outright — it's on every attacker's
 *      credential-stuffing list.
 *
 * Does NOT enforce legacy "must have uppercase + symbol + number"
 * rules. Those are cargo-cult and actively harmful (they push people
 * toward `Password1!` patterns that are easy to guess).
 *
 * Fail-open on HIBP network errors (see `hibp.ts`). Outage of their
 * service shouldn't block signups.
 */

import { isPasswordBreached } from "@/lib/auth/hibp";

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; reason: "too_short" | "breached"; message: string };

const MIN_LENGTH = 10;

export async function validatePassword(
  password: string
): Promise<PasswordValidationResult> {
  if (password.length < MIN_LENGTH) {
    return {
      ok: false,
      reason: "too_short",
      message: `Password must be at least ${MIN_LENGTH} characters. Longer passwords are stronger than shorter ones with special characters.`,
    };
  }

  if (await isPasswordBreached(password)) {
    return {
      ok: false,
      reason: "breached",
      message:
        "This password has appeared in a known data breach. Please choose a different one. (We check against haveibeenpwned.com — we don't send your password to them, only a partial hash.)",
    };
  }

  return { ok: true };
}
