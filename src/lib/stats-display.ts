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
 * Converts a rank + total pair into a human-readable display value with
 * highlight and "unranked" flags.
 *
 * - When total = 0 or rank > total the member has no activity → "—" (unranked)
 * - When total < 50 use ordinal ("3rd") and highlight the top 3
 * - When total ≥ 50 use percentile ("Top 8%") and highlight top 10 %
 */
export function formatRankDisplay(
  rank: number,
  total: number,
): { value: string; isHighlighted: boolean; isUnranked: boolean } {
  if (total === 0 || rank > total) {
    return { value: "—", isHighlighted: false, isUnranked: true };
  }
  if (total < 50) {
    return { value: ordinal(rank), isHighlighted: rank <= 3, isUnranked: false };
  }
  const pct = Math.ceil((rank / total) * 100);
  return { value: `Top ${pct}%`, isHighlighted: pct <= 10, isUnranked: false };
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
