/**
 * Typed payload contracts for the analytics suite.
 *
 * Every server action returns a versioned shape so the client can render
 * without guessing. Bump `version` on any breaking change to a payload.
 */

import type { AudienceKind } from "@/lib/supabase/types";

/**
 * Analytics period options.
 *
 *   - week / month / quarter — calendar-aligned windows of the current date.
 *   - year                   — year-to-date (Jan 1 → today). NOT a full
 *                              calendar year; the old full-year behavior
 *                              was confusing because the trend chart
 *                              reserved empty space for future months.
 *   - last_6_months          — rolling 6 calendar months ending today.
 *   - last_12_months         — rolling 12 calendar months ending today.
 *   - custom                 — caller-supplied `start` + `end`.
 */
export type PeriodLabel =
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "last_6_months"
  | "last_12_months"
  | "custom";

export interface Period {
  /** ISO date "YYYY-MM-DD", inclusive, gym TZ. */
  start: string;
  /** ISO date "YYYY-MM-DD", inclusive, gym TZ. */
  end: string;
  /** IANA gym timezone, e.g. "America/Chicago". */
  tz: string;
  label: PeriodLabel;
}

/**
 * A scalar KPI rendered as a big number + comparison delta.
 * `direction` is independent of `deltaPct` so we can style "at risk went UP"
 * as a warning rather than a positive trend.
 */
export interface KpiDelta {
  value: number;
  deltaAbs: number | null;
  deltaPct: number | null;
  direction: "up" | "down" | "flat" | null;
}

export interface TrendPoint {
  date: string;               // ISO date "YYYY-MM-DD"
  current: number;
  previous: number | null;    // aligned day-of-period index vs compare window
}

export type NarrativeSeverity = "info" | "good" | "warning" | "danger";

export interface Narrative {
  severity: NarrativeSeverity;
  text: string;
}

// ─── Needs Attention items (Overview) ────────────────────────────────────────

export type NeedsAttentionItem =
  | { type: "at_risk"; memberId: number; name: string; daysSince: number }
  | { type: "low_attendance_class"; slotId: number; name: string; avg: number; expected: number };

// ─── Page payloads ───────────────────────────────────────────────────────────

export interface OverviewPayload {
  version: 1;
  generatedAt: string;        // ISO timestamp
  period: Period;
  compare: Period | null;
  kpis: {
    activeMembers: KpiDelta;
    checkIns: KpiDelta;
    newMembers: KpiDelta;
    netGrowth: KpiDelta;
    atRisk: KpiDelta;
  };
  trend: TrendPoint[];
  needsAttention: NeedsAttentionItem[];
  narratives: Narrative[];
}

export interface AttendancePayload {
  /** v2 (WS5 class taxonomy) — adds dimension breakdowns + per-modality
   *  trend + the active filter set. Consumers must branch on version if
   *  we ever need to support both shapes simultaneously; today v1 is
   *  gone. */
  version: 2;
  generatedAt: string;
  period: Period;
  compare: Period | null;
  /** Echo of the filters server-applied to this payload — lets the UI
   *  render filter chips + URL state without re-reading the params. */
  filters: AttendanceFiltersEcho;
  kpis: {
    totalCheckIns: KpiDelta;
    uniqueMembers: KpiDelta;
    avgPerClass: KpiDelta;
  };
  trend: TrendPoint[];
  topClasses: { name: string; count: number }[];
  bottomClasses: { name: string; count: number }[];
  /** Class popularity with per-weekday breakdown — feeds the stacked
   *  bar chart so both rank and day-of-week distribution read in one
   *  glance. Each row has `mon`..`sun` counts + `total`, plus a
   *  `modalityName` snapshot consumed by the bar chart's
   *  `colorBy="modality"` mode. */
  classByWeekday: {
    name: string;
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
    sun: number;
    total: number;
    modalityName: string | null;
  }[];
  /** Rows indexed by day_of_week (1=Mon), each row is 24 hourly buckets. */
  heatmap: { day: number; hour: number; count: number }[];

  // ── Dimension breakdowns (LLD §5.2) ──────────────────────────────────────
  /** Check-ins grouped by modality snapshot. Sorted desc by count. */
  modalityBreakdown: { modalityId: number | null; name: string; color: string | null; count: number }[];
  /** Check-ins grouped by level snapshot. NULL level_id surfaces as
   *  "Unspecified" per LLD §5.1 `COALESCE`. */
  levelBreakdown: { levelId: number | null; name: string; count: number }[];
  /** Check-ins grouped by audience. Totals can exceed the period's
   *  check-in count because a check-in may credit multiple audiences. */
  audienceBreakdown: {
    audienceId: number | null;
    name: string;
    kind: AudienceKind | null;
    count: number;
  }[];
  /** Per-modality daily trend — one entry per modality (top-N cap
   *  applied server-side), `points` is zero-filled across the period
   *  so every series renders aligned on the X axis. */
  modalityTrend: {
    modalityId: number | null;
    name: string;
    color: string | null;
    points: { date: string; count: number }[];
  }[];

  narratives: Narrative[];
}

/**
 * Echo of the applied filters — carries both the raw slug list from the
 * URL and the resolved id list used by the query. UI renders from this
 * shape so the server is the only place that knows how to resolve
 * slug→id.
 */
export interface AttendanceFiltersEcho {
  modality: { ids: number[]; slugs: string[] };
  level: { id: number | null; slug: string | null };
  audience: { ids: number[]; slugs: string[] };
}

export interface MembersPayload {
  version: 1;
  generatedAt: string;
  period: Period;
  mostConsistent: { memberId: number; name: string; count: number }[];
  newMembers: { memberId: number; name: string; joinedAt: string; checkIns: number }[];
  atRisk: { memberId: number; name: string; daysSince: number; lastClassName: string | null }[];
  narratives: Narrative[];
}

export interface InstructorsPayload {
  version: 1;
  generatedAt: string;
  period: Period;
  leaderboard: {
    instructorId: number | null;
    name: string;
    classesTaught: number;
    totalAttendance: number;
    avgAttendance: number;
    uniqueMembers: number;
  }[];
  /** Daily attendance trend for the top 3 instructors (by totalAttendance). */
  topTrend: {
    instructorId: number | null;
    name: string;
    points: { date: string; count: number }[];
  }[];
  narratives: Narrative[];
}

// ─── Server action input ────────────────────────────────────────────────────

export interface AnalyticsParams {
  label?: PeriodLabel;
  /** Only used when label === "custom". */
  start?: string;
  end?: string;
  /** When true, the payload includes a `compare` period for deltas. */
  compare?: boolean;

  // ── WS5 class-taxonomy filters ───────────────────────────────────────────
  /** Comma-joined modality slugs (e.g. `["gi","no-gi"]`). Multi-select. */
  modalitySlugs?: string[];
  /** Single level slug. Per LLD §3.4, level is single-select. */
  levelSlug?: string | null;
  /** Comma-joined audience slugs. Multi-select. */
  audienceSlugs?: string[];
}
