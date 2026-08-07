/**
 * MX lookup — "can this domain receive mail at all?"
 *
 * The syntax checks in `deliverability.ts` catch reserved and fixture
 * domains, but not a domain that is simply wrong or dead. `souljj.team`
 * (this repo's own bootstrap domain) is the cautionary example: perfectly
 * well-formed, no MX record, every message to it hard-bounces.
 *
 * A domain with no MX and no A/AAAA record cannot accept SMTP, so mail to
 * it is a guaranteed bounce and we refuse it before handing it to the
 * mailer. The A/AAAA fallback matters: RFC 5321 §5.1 says a host with an
 * address record but no MX is still a valid mail destination, and a few
 * small business domains really are configured that way. Checking only MX
 * would reject them.
 *
 * Fails OPEN. A DNS timeout means we don't know, and refusing a signup
 * because our resolver hiccuped is worse than accepting one bounce — the
 * same reasoning as the HIBP check in `src/lib/auth/hibp.ts`. Only an
 * authoritative "this domain has no mail route" (NXDOMAIN, or empty
 * answers for all three record types) rejects.
 *
 * Server-only: `node:dns` has no browser equivalent.
 */

import { promises as dns } from "node:dns";
import { log } from "@/lib/log";

const TIMEOUT_MS = 3000;

/** DNS error codes that mean an authoritative "nothing here". */
const EMPTY_ANSWER_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

export type MxVerdict =
  /** Domain has a mail route, or we could not determine one (fail-open). */
  | { deliverable: true; checked: boolean }
  /** Domain authoritatively has no mail route. */
  | { deliverable: false };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("dns_timeout")), ms)
    ),
  ]);
}

/**
 * True when the rejection is an authoritative empty answer rather than a
 * transport failure. Anything else (SERVFAIL, timeout, refused) is unknown
 * and must fail open.
 */
function isEmptyAnswer(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === "string" && EMPTY_ANSWER_CODES.has(code);
}

/**
 * Resolve one record type. Returns true if records exist, false on an
 * authoritative empty answer, and null when the lookup itself failed
 * (caller treats null as "unknown" and fails open).
 */
async function hasRecords(
  lookup: () => Promise<unknown[]>,
  domain: string,
  kind: string
): Promise<boolean | null> {
  try {
    const records = await withTimeout(lookup(), TIMEOUT_MS);
    return records.length > 0;
  } catch (err) {
    if (isEmptyAnswer(err)) return false;
    // Domain is not PII, so it is safe to log in full — see the PII note in
    // src/lib/log.ts. It is the only useful key for diagnosing this.
    log.warn("mx: lookup failed, failing open", { domain, kind });
    return null;
  }
}

/**
 * Check whether `domain` can receive mail.
 *
 * `checked: false` on the success path means the lookups were inconclusive
 * and we allowed it through — callers that log should distinguish the two so
 * a resolver outage is visible rather than looking like a clean pass.
 */
export async function domainAcceptsMail(domain: string): Promise<MxVerdict> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return { deliverable: false };

  const mx = await hasRecords(() => dns.resolveMx(normalized), normalized, "MX");
  if (mx === true) return { deliverable: true, checked: true };
  if (mx === null) return { deliverable: true, checked: false };

  // No MX. Fall back to A/AAAA — an address record alone still makes the
  // host a valid mail destination (RFC 5321 §5.1).
  const [a, aaaa] = await Promise.all([
    hasRecords(() => dns.resolve4(normalized), normalized, "A"),
    hasRecords(() => dns.resolve6(normalized), normalized, "AAAA"),
  ]);

  if (a === true || aaaa === true) return { deliverable: true, checked: true };
  if (a === null || aaaa === null) return { deliverable: true, checked: false };

  // MX, A, and AAAA all authoritatively empty: nothing can accept mail here.
  return { deliverable: false };
}
