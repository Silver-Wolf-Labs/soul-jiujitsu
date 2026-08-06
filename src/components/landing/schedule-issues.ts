/**
 * Admin-mode issue detector for schedule slots.
 *
 * Extracted from `Schedule.tsx` so both the per-card badge renderer and
 * the page-level summary chip can share a single source of truth. Each
 * rule is written to be conservative — we'd rather miss a real issue
 * than nag about intentional configuration. The 80/20 picks:
 *
 *   1. `no_instructor`  — active class without an instructor, except
 *                         Open Mat (instructor-optional by design).
 *                         Catches the "forgot to assign coach" miss.
 *   2. `duplicate`      — another active slot shares this slot's day
 *                         + start_time + title + area. Classic
 *                         copy-paste mistake; the `area` check keeps
 *                         legitimate Mat 1 / Mat 2 concurrent classes
 *                         out of the false-positive bucket.
 *   3. `bad_time_window`— end_time ≤ start_time OR duration > 4 h.
 *                         Catches data-entry typos (6→7pm saved as
 *                         7→6pm, or AM/PM flipped).
 *   4. `area_conflict`  — two active slots on the same `area` whose
 *                         [start_time, end_time) windows overlap.
 *                         Only flags when `area` is set (no area =
 *                         "anywhere"; no conflict by construction).
 *
 * Intentionally omitted (too noisy / not reliably actionable):
 *   - missing level / focus / audience (often intentional)
 *   - title ↔ modality mismatch (heuristic, many false positives)
 *   - odd hours (gyms vary too much on this)
 *   - modality-less slot (DB enforces NOT NULL post-Phase-3)
 */

import type { EnrichedScheduleSlot } from "./Schedule";

export type IssueCode =
  | "no_instructor"
  | "duplicate"
  | "bad_time_window"
  | "area_conflict";

export type IssueSeverity = "warn" | "error";

export interface IssueDef {
  code: IssueCode;
  label: string;       // badge text — short enough to fit next to modality color border
  tooltip: string;     // hover text — explanation + how-to-fix hint
  severity: IssueSeverity;
}

/**
 * Display metadata for each issue code. Kept in a flat object so a
 * component can render a legend (iterate over values) or look up a
 * single rule (by code) without a second source.
 */
export const ISSUE_DEFS: Record<IssueCode, IssueDef> = {
  no_instructor: {
    code: "no_instructor",
    label: "No instructor",
    tooltip: "Active class with no instructor assigned. Open Mat is exempt. Click to edit → pick an instructor.",
    severity: "warn",
  },
  duplicate: {
    code: "duplicate",
    label: "Duplicate",
    tooltip: "Another active slot has the same day, start time, title, and area. Likely a copy-paste mistake — delete one.",
    severity: "error",
  },
  bad_time_window: {
    code: "bad_time_window",
    label: "Bad time",
    tooltip: "End time is before start, or the class runs more than 4 hours. Check for an AM/PM typo.",
    severity: "error",
  },
  area_conflict: {
    code: "area_conflict",
    label: "Mat conflict",
    tooltip: "Another class overlaps this one on the same mat/area. Move one to a different mat or time.",
    severity: "error",
  },
};

/** Minimal slot shape the detectors need — decoupled from
 *  `EnrichedScheduleSlot` so the module stays portable. */
export interface DetectableSlot {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  title: string;
  area: string | null;
  active: boolean;
  instructor_name: string | null;
  modality_slug: string | null;
}

function timeToMinutes(time: string): number {
  // Expecting "HH:MM:SS" or "HH:MM". Non-regex path for hot-loop speed.
  const [hStr, mStr] = time.split(":");
  return (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);
}

const MAX_DURATION_MINUTES = 4 * 60;

/**
 * Detect issues for a single slot in the context of the full week's
 * slots (cross-slot rules need the neighbor list). Returns an ordered
 * array — most-actionable-first.
 *
 * O(n) per call; the caller should memoize a `Map<slotId, IssueCode[]>`
 * keyed on the slot array identity so React renders don't re-scan on
 * every card render.
 */
export function detectIssues(
  slot: DetectableSlot,
  all: readonly DetectableSlot[],
): IssueCode[] {
  if (!slot.active) return [];

  const issues: IssueCode[] = [];
  const startMin = timeToMinutes(slot.start_time);
  const endMin = timeToMinutes(slot.end_time);
  const titleKey = slot.title.trim().toLowerCase();
  const areaKey = (slot.area ?? "").trim().toLowerCase();

  // 1. No instructor (Open Mat exempt — instructor-optional by convention).
  if (slot.modality_slug !== "open-mat" && !slot.instructor_name) {
    issues.push("no_instructor");
  }

  // 2. Bad time window.
  if (endMin <= startMin || endMin - startMin > MAX_DURATION_MINUTES) {
    issues.push("bad_time_window");
  }

  // 3. Duplicate (same day+time+title+area).
  const hasDuplicate = all.some(o =>
    o.id !== slot.id &&
    o.active &&
    o.day_of_week === slot.day_of_week &&
    o.start_time === slot.start_time &&
    o.title.trim().toLowerCase() === titleKey &&
    (o.area ?? "").trim().toLowerCase() === areaKey,
  );
  if (hasDuplicate) issues.push("duplicate");

  // 4. Area conflict (overlap on same mat). Only meaningful when area is set.
  if (areaKey.length > 0) {
    const conflicts = all.some(o => {
      if (o.id === slot.id || !o.active) return false;
      if (o.day_of_week !== slot.day_of_week) return false;
      if ((o.area ?? "").trim().toLowerCase() !== areaKey) return false;
      const oStart = timeToMinutes(o.start_time);
      const oEnd = timeToMinutes(o.end_time);
      // Half-open interval overlap: [a,b) ∩ [c,d) iff a < d AND c < b.
      return startMin < oEnd && oStart < endMin;
    });
    if (conflicts) issues.push("area_conflict");
  }

  return issues;
}

/**
 * Build a map of slot.id → IssueCode[] for the whole week. Intended to
 * be memoized on the slot-array identity so admin-mode rendering stays
 * O(n) across re-renders.
 */
export function buildIssueMap(
  slots: readonly DetectableSlot[],
): Map<number, IssueCode[]> {
  const out = new Map<number, IssueCode[]>();
  for (const s of slots) {
    const issues = detectIssues(s, slots);
    if (issues.length > 0) out.set(s.id, issues);
  }
  return out;
}

/**
 * Aggregate issue counts for the summary chip above the grid. Returns
 * totals by code in canonical order plus a grand total.
 */
export function summarizeIssues(
  issueMap: Map<number, IssueCode[]>,
): { total: number; byCode: Record<IssueCode, number> } {
  const byCode: Record<IssueCode, number> = {
    no_instructor: 0,
    duplicate: 0,
    bad_time_window: 0,
    area_conflict: 0,
  };
  let total = 0;
  for (const codes of issueMap.values()) {
    total += codes.length;
    for (const code of codes) byCode[code] += 1;
  }
  return { total, byCode };
}

// Re-export for callers that want to narrow the `EnrichedScheduleSlot`
// argument statically (the detector only reads the fields on
// `DetectableSlot`, but passing the wider type is fine too).
export type EnrichedScheduleSlotIssueInput = Pick<
  EnrichedScheduleSlot,
  | "id"
  | "day_of_week"
  | "start_time"
  | "end_time"
  | "title"
  | "area"
  | "active"
  | "instructor_name"
  | "modality_slug"
>;
