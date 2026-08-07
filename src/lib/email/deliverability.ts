/**
 * Pre-send email deliverability checks — the bounce-rate mitigation.
 *
 * Why this exists: Supabase Auth sends a confirmation email to whatever
 * address `signUp()` is handed. `type="email"` in the browser only checks
 * for an `@`, so `rob@gmial.com` and `test@example.com` both sail through
 * and both hard-bounce. Enough of those and the provider throttles or
 * suspends sending for the whole project — which is exactly the warning
 * that prompted this module.
 *
 * Everything here is pure and synchronous so it can run in the browser
 * (instant feedback, no round trip) and be unit-tested without network.
 * The DNS/MX half of the check — which needs a server — lives in
 * `src/lib/actions/email-deliverability.ts` and calls into this file first.
 *
 * Three classes of undeliverable address are caught:
 *
 *   1. Reserved names that can never receive mail. RFC 2606 + RFC 6761
 *      set aside `.test` / `.example` / `.invalid` / `.localhost` and the
 *      `example.com|net|org` domains precisely so they never resolve. Mail
 *      to them is a guaranteed bounce, so they must never reach the mailer.
 *   2. This repo's own fixture domains. Seed and bootstrap scripts mint
 *      synthetic identities; if one ever reaches a live signup form it
 *      bounces like any other dead domain.
 *   3. Typos in the big consumer providers. `gmial.com`, `hotmial.com`,
 *      and friends are the single largest real-world bounce source — a
 *      member fat-fingers one character and never learns why the email
 *      never came. We suggest rather than block: the edit distance is a
 *      heuristic, and a real (if odd) domain must not be refused.
 *
 * Deliberately NOT here: disposable-address blocklists. Throwaway
 * providers *accept* mail, so they don't bounce — refusing them is a
 * product policy decision, not a deliverability fix.
 */

// ── Address shape ───────────────────────────────────────────────────────────

/**
 * Pragmatic address pattern. Stricter than `type="email"` (which accepts
 * `a@b`) and deliberately looser than RFC 5322 — the full grammar allows
 * quoted local parts and comments that no gym member will ever type, and
 * implementing it would reject valid addresses through sheer complexity.
 *
 * Requires: non-empty local part, a dotted domain, and a TLD of 2+ letters.
 */
const ADDRESS_RE = /^[^\s@,;:<>()[\]\\"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/** Reserved TLDs that are guaranteed never to resolve. RFC 2606 §2, RFC 6761. */
const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost", "local"]);

/** Second-level domains reserved for documentation. RFC 2606 §3. */
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

/**
 * Fixture domains used by this repo's own scripts — `supabase/seed_analytics.ts`
 * (`souljj.test`) and `supabase/bootstrap_people.ts`. Listed explicitly so a
 * fixture address typed into a live form is refused with a clear reason rather
 * than silently bouncing. `souljj.test` is already covered by RESERVED_TLDS;
 * it is repeated here for intent.
 */
const FIXTURE_DOMAINS = new Set(["souljj.test", "souljj.team", "souljj.invalid"]);

// ── Typo correction ─────────────────────────────────────────────────────────

/**
 * Domains worth typo-checking: high enough share of any Costa Rican gym's
 * membership that a near-miss is far more likely to be a slip than a real
 * address. Ordered by prevalence, not that it matters for the lookup.
 */
const COMMON_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "outlook.es",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "live.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "ice.co.cr",
  "racsa.co.cr",
];

/**
 * Levenshtein distance, capped: we only ever care whether the distance is
 * 1 or 2, so bail out early rather than filling the whole matrix.
 */
function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }

    // Every remaining row can only grow, so once the best cell in this row
    // exceeds the cap the final distance does too.
    if (rowMin > max) return max + 1;
    prev = curr;
  }

  return prev[b.length];
}

/**
 * How many edits from `candidate` still counts as a typo of it, rather than a
 * different domain that merely looks similar.
 *
 * Scaled by length because a single edit means something very different at
 * each scale. A false positive here is the expensive direction: "correcting"
 * a member's real domain sends their confirmation link to a stranger's
 * address, which is worse than letting one typo through to a bounce.
 *
 *   ≤ 6 chars  → never suggested. `me.com` is one edit from `we.com`,
 *                `he.com`, `me.co`… far too many of which are real. There is
 *                no signal to work with at this length.
 *   7–8 chars  → 1 edit. Catches `yaho.com` → `yahoo.com`.
 *   ≥ 9 chars  → 2 edits. Catches transposition-plus-slip cases like
 *                `gmail.cmo` → `gmail.com`, where 1 edit is not enough.
 */
function typoThreshold(candidate: string): number {
  if (candidate.length <= 6) return 0;
  return candidate.length >= 9 ? 2 : 1;
}

/**
 * Suggest a corrected address, or null when the domain looks intentional.
 *
 * An exact match on a common domain returns null — there is nothing to fix.
 */
export function suggestEmailCorrection(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;

  let best: { domain: string; distance: number } | null = null;

  for (const candidate of COMMON_DOMAINS) {
    const limit = typoThreshold(candidate);
    if (limit === 0) continue;

    const distance = editDistance(domain, candidate, limit);
    if (distance > limit) continue;
    if (!best || distance < best.distance) best = { domain: candidate, distance };
  }

  return best ? `${local}@${best.domain}` : null;
}

// ── Verdict ─────────────────────────────────────────────────────────────────

export type EmailRejectionReason =
  | "malformed"
  | "reserved_tld"
  | "reserved_domain"
  | "fixture_domain";

export type EmailCheck =
  | { ok: true; email: string; suggestion: string | null }
  | { ok: false; reason: EmailRejectionReason; message: string };

/**
 * Normalize an address for storage and comparison: trim, lowercase.
 *
 * Local parts are technically case-sensitive per RFC 5321, but no provider
 * in practice treats them that way, and the rest of this codebase already
 * lowercases on write (`members.email`, `resetPasswordForEmail`, the
 * suppression table). Matching that keeps lookups consistent.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Check an address for the bounce classes we can detect without a network
 * call. Returns the normalized address plus an optional typo suggestion on
 * success — callers surface the suggestion, they don't apply it silently.
 *
 * Messages are user-facing Spanish, matching the join and portal forms.
 */
export function checkEmailAddress(rawEmail: string): EmailCheck {
  const email = normalizeEmail(rawEmail);

  if (!ADDRESS_RE.test(email)) {
    return {
      ok: false,
      reason: "malformed",
      message: "Ese correo no parece válido. Revísalo e intenta de nuevo.",
    };
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);
  const tld = domain.slice(domain.lastIndexOf(".") + 1);

  // Fixture check runs before the reserved checks so a repo fixture address
  // gets the specific message instead of the generic reserved-TLD one.
  if (FIXTURE_DOMAINS.has(domain)) {
    return {
      ok: false,
      reason: "fixture_domain",
      message:
        `${domain} es un dominio de prueba interno y no recibe correo. ` +
        "Usa una dirección real.",
    };
  }

  if (RESERVED_TLDS.has(tld)) {
    return {
      ok: false,
      reason: "reserved_tld",
      message:
        `Los dominios .${tld} están reservados para pruebas y no reciben ` +
        "correo. Usa una dirección real.",
    };
  }

  if (RESERVED_DOMAINS.has(domain)) {
    return {
      ok: false,
      reason: "reserved_domain",
      message:
        `${domain} es un dominio reservado para documentación y no recibe ` +
        "correo. Usa una dirección real.",
    };
  }

  return { ok: true, email, suggestion: suggestEmailCorrection(email) };
}
