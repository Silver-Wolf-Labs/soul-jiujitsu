/**
 * HaveIBeenPwned password-breach check via k-anonymity.
 *
 * How this works without leaking the password:
 *   1. SHA-1 hash the password locally.
 *   2. Send only the first 5 hex characters of the hash to the HIBP
 *      "Pwned Passwords" range API.
 *   3. API returns ~500 matching hash SUFFIXES (plus a count each).
 *   4. We compare suffixes locally. If ours matches, the password is
 *      in the breach corpus.
 *
 * The full password never leaves our server. HIBP never knows which
 * of the 500 suffixes we were looking for. Privacy-preserving by
 * construction.
 *
 * The API is free, rate-limited at a generous tier, requires no
 * authentication. If the service is down we fail OPEN (allow the
 * password) — HIBP outage shouldn't block signup. Failing closed
 * would be worse UX than the security gain.
 */

import { log } from "@/lib/log";

const HIBP_ENDPOINT = "https://api.pwnedpasswords.com/range";
const TIMEOUT_MS = 3000;

/**
 * Return the number of times `password` appears in the HIBP corpus.
 * Returns 0 if the password isn't found OR if the API is unreachable.
 * Callers treating `> 0` as "reject" get correct behavior on the
 * happy path; on network failure, we fail open.
 */
export async function countPasswordBreaches(password: string): Promise<number> {
  try {
    const fullHash = await sha1Hex(password);
    const prefix = fullHash.slice(0, 5).toUpperCase();
    const suffix = fullHash.slice(5).toUpperCase();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${HIBP_ENDPOINT}/${prefix}`, {
      signal: controller.signal,
      headers: {
        // HIBP encourages adding a padding flag to defeat traffic
        // analysis that could infer the prefix from response size.
        "Add-Padding": "true",
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      log.warn("hibp: non-2xx response", { status: res.status });
      return 0;
    }

    const body = await res.text();
    // Body is newline-separated `SUFFIX:COUNT` rows.
    for (const line of body.split("\n")) {
      const [candidateSuffix, countStr] = line.trim().split(":");
      if (candidateSuffix === suffix) {
        return parseInt(countStr, 10) || 1;
      }
    }
    return 0;
  } catch (err) {
    // Network error, timeout, etc. Fail open.
    log.warn("hibp: check failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Thin wrapper: true if the password has appeared in a breach.
 * Threshold is 1+ — any appearance is disqualifying. The reasoning:
 * a password that appears even once in a breach is on every attacker's
 * credential-stuffing list. "Only appeared once, still OK" is not a
 * defensible threshold.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  return (await countPasswordBreaches(password)) > 0;
}

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
