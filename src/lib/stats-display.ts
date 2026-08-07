/**
 * Shared display helpers for member stats and rankings.
 *
 * Extracted from the kiosk check-in page so the same formatting logic can
 * be reused in the portal landing, portal profile, and admin member detail
 * pages without duplication.
 */

// ── Re-export stat types so callers have a single import point ────────────────
export type {
  KioskMemberStats,
  GymRankings,
} from "@/lib/actions/check-ins";

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Returns "<n> <word>" with the word pluralised when n ≠ 1.
 * e.g. plural(1, "class") → "1 class", plural(3, "class") → "3 classes"
 */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Returns an ordinal suffix string for a number.
 * e.g. ordinal(1) → "1st", ordinal(2) → "2nd", ordinal(13) → "13th"
 */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Which of the three ways a rank gets shown, plus the number to show it with.
 *
 * - total = 0 or rank > total → the member has no activity, so there is no rank
 * - total < 50 → position ("3rd", "#3"), highlighted for the top 3
 * - total ≥ 50 → percentile ("Top 8%"), highlighted for the top 10 %
 *
 * Deliberately not a formatted string. This is called from a component shared by
 * the Spanish portal and the English kiosk, and the wording differs by more than
 * a word: English has an ordinal suffix system ("3rd") and Spanish does not. So
 * the decision — which bucket, and highlighted or not — is made here, and the
 * call site turns it into words. Same reason the surrounding labels are injected:
 * see the Copy block in StatsTilesGrid.
 */
export type RankDisplay =
  | { kind: "unranked" }
  | { kind: "position"; rank: number; isHighlighted: boolean }
  | { kind: "percentile"; percent: number; isHighlighted: boolean };

export function formatRankDisplay(rank: number, total: number): RankDisplay {
  if (total === 0 || rank > total) {
    return { kind: "unranked" };
  }
  if (total < 50) {
    return { kind: "position", rank, isHighlighted: rank <= 3 };
  }
  const percent = Math.ceil((rank / total) * 100);
  return { kind: "percentile", percent, isHighlighted: percent <= 10 };
}

/**
 * Returns a human-readable gym tenure string from a join timestamp.
 * e.g. "Less than a month", "2 years, 3 months"
 * Returns null when joinedAt is null/falsy.
 */
export function gymTenure(joinedAt: string | null | undefined): string | null {
  if (!joinedAt) return null;
  const start = new Date(joinedAt);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0 && months === 0) return "Less than a month";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  return parts.join(", ");
}
