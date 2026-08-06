/**
 * Period normalization for the analytics suite.
 *
 * Everything here works in the gym's local timezone. The server runs on
 * Vercel (UTC), the kiosk is in Dallas, and "Tuesday 6 PM is our busiest
 * slot" only makes sense if every date math call agrees on what "today"
 * means. Use `gymToday()` as the anchor, not `new Date()`.
 *
 * All functions are pure aside from reading the cached gym TZ once; they
 * never mutate inputs and always return fresh `Period` objects.
 */

import { getGymTz } from "@/lib/gym-time";
import type { AnalyticsParams, Period, PeriodLabel } from "@/lib/analytics/types";

/** Add `days` to an ISO date string "YYYY-MM-DD" without TZ drift. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Build in UTC to avoid the local-midnight-Silicon-Valley trap: when the
  // server is in a timezone west of the date, `new Date("2024-01-01")` can
  // land on Dec 31. UTC math keeps the date integer stable, and we format
  // the result back with ISO's UTC methods.
  const d0 = Date.UTC(y, m - 1, d);
  const d1 = new Date(d0 + days * 86_400_000);
  const yy = d1.getUTCFullYear();
  const mm = String(d1.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d1.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Inclusive day count between two ISO dates (start ≤ end). */
export function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const s = Date.UTC(sy, sm - 1, sd);
  const e = Date.UTC(ey, em - 1, ed);
  return Math.round((e - s) / 86_400_000) + 1;
}

/** "YYYY-MM-DD" in the given TZ for a given Date instance. */
function isoDateInTz(date: Date, tz: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

/** day_of_week 1..7 (Mon..Sun) for an ISO date — canonical PG convention. */
export function pgDowFromIso(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
}

/** Monday of the week containing `isoDate`, in the same ISO format. */
export function startOfWeek(isoDate: string): string {
  const dow = pgDowFromIso(isoDate); // 1..7
  return addDays(isoDate, -(dow - 1));
}

/** First day of the calendar month for `isoDate`. */
export function startOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Last day of the calendar month for `isoDate`. */
export function endOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  // Day 0 of the NEXT month = last day of THIS month.
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First day of the quarter containing `isoDate` (Q1=Jan, Q2=Apr, ...). */
export function startOfQuarter(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qStart).padStart(2, "0")}-01`;
}

export function endOfQuarter(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const qEndMonth = Math.floor((m - 1) / 3) * 3 + 3;
  return endOfMonth(`${y}-${String(qEndMonth).padStart(2, "0")}-01`);
}

/** Subtract `months` from an ISO date without TZ drift. Preserves the
 *  day-of-month; JS `Date` normalizes overflow (Mar 31 → Feb 28/29). */
export function subtractMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - months, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Today's ISO date in the gym TZ (not UTC). */
export async function gymTodayIso(): Promise<string> {
  const tz = await getGymTz();
  return isoDateInTz(new Date(), tz);
}

/**
 * Build a `Period` for the given label. When label === "custom" the caller
 * must pass both `start` and `end`; otherwise dates are derived from the
 * gym's "today" anchor.
 */
export async function buildPeriod(
  params: AnalyticsParams = {},
  anchor?: string,
): Promise<Period> {
  const tz = await getGymTz();
  const today = anchor ?? await gymTodayIso();
  const label: PeriodLabel = params.label ?? "week";

  switch (label) {
    case "week": {
      const start = startOfWeek(today);
      return { start, end: addDays(start, 6), tz, label };
    }
    case "month": {
      return { start: startOfMonth(today), end: endOfMonth(today), tz, label };
    }
    case "quarter": {
      return { start: startOfQuarter(today), end: endOfQuarter(today), tz, label };
    }
    case "year": {
      // Year-to-date. Jan 1 → today. Trimming the empty tail keeps the
      // chart canvas fully occupied by real data.
      const [y] = today.split("-");
      return { start: `${y}-01-01`, end: today, tz, label };
    }
    case "last_6_months": {
      return { start: subtractMonths(today, 6), end: today, tz, label };
    }
    case "last_12_months": {
      return { start: subtractMonths(today, 12), end: today, tz, label };
    }
    case "custom": {
      if (!params.start || !params.end) {
        throw new Error("Custom period requires both `start` and `end`.");
      }
      if (params.start > params.end) {
        throw new Error("Custom period `start` must be ≤ `end`.");
      }
      return { start: params.start, end: params.end, tz, label };
    }
  }
}

/**
 * The comparison window immediately preceding `period`. For calendar-aligned
 * periods (month/quarter/year) we step one calendar unit back so "this month
 * vs last month" doesn't drift. For `week` and `custom` we subtract the same
 * number of days — simpler, and what the UI copy ("vs previous") implies.
 */
export function previousPeriod(period: Period): Period {
  const { label, start, end, tz } = period;
  switch (label) {
    case "week": {
      const span = daysBetween(start, end);
      const newEnd = addDays(start, -1);
      return { start: addDays(newEnd, -(span - 1)), end: newEnd, tz, label };
    }
    case "month": {
      const prevMonthAnchor = addDays(start, -1); // last day of previous month
      return { start: startOfMonth(prevMonthAnchor), end: endOfMonth(prevMonthAnchor), tz, label };
    }
    case "quarter": {
      const prevQAnchor = addDays(start, -1);
      return { start: startOfQuarter(prevQAnchor), end: endOfQuarter(prevQAnchor), tz, label };
    }
    case "year": {
      // Year-to-date comparison — same number of days elapsed into last
      // year, so a YoY delta stays apples-to-apples.
      const [y] = start.split("-").map(Number);
      const spanYtd = daysBetween(start, end);
      const newStart = `${y - 1}-01-01`;
      return { start: newStart, end: addDays(newStart, spanYtd - 1), tz, label };
    }
    case "last_6_months":
    case "last_12_months":
    case "custom": {
      // Rolling windows: same span, shifted back by its own length.
      const span = daysBetween(start, end);
      const newEnd = addDays(start, -1);
      return { start: addDays(newEnd, -(span - 1)), end: newEnd, tz, label };
    }
  }
}

/**
 * For a date inside `compare`, return the aligned ISO date inside `period`.
 * Used when overlaying previous-period attendance onto the current trend
 * chart so the X axis shows current-period dates only.
 */
export function alignToCurrent(date: string, compare: Period, period: Period): string | null {
  const offset = Math.round(
    (Date.UTC(...splitIsoDate(date)) - Date.UTC(...splitIsoDate(compare.start))) / 86_400_000,
  );
  if (offset < 0) return null;
  return addDays(period.start, offset);
}

function splitIsoDate(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m - 1, d];
}

/**
 * Compute a delta between two raw values.
 *   - If `previous` is null/undefined, deltas are null and direction is null.
 *   - If `previous === 0 && current !== 0`, return null for deltaPct (avoid
 *     division-by-zero misinformation); deltaAbs still surfaces the change.
 */
import type { KpiDelta } from "@/lib/analytics/types";

export function computeDelta(current: number, previous: number | null | undefined): KpiDelta {
  if (previous == null) {
    return { value: current, deltaAbs: null, deltaPct: null, direction: null };
  }
  const deltaAbs = current - previous;
  const deltaPct = previous === 0 ? null : deltaAbs / previous;
  const direction: KpiDelta["direction"] =
    deltaAbs > 0 ? "up" : deltaAbs < 0 ? "down" : "flat";
  return { value: current, deltaAbs, deltaPct, direction };
}
