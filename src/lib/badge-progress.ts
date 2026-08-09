/**
 * Turning the database's raw counters into something a progress bar can draw.
 *
 * The rules themselves are NOT here, and that is the point. `rule_kind` and its
 * parameters live in the `badges` row so the profe can add "50 clases de Gi" from
 * the admin console without a deploy, and they are evaluated by
 * member_badge_progress() in SQL — one copy, shared with the awarding path (see
 * 20260814000000_badge_progress.sql). Re-implementing "count the check-ins after
 * 18:00" in TypeScript would mean a bar that fills to 50/50 while the badge is
 * never awarded, or the reverse, the first time the two definitions drifted.
 *
 * What this module owns is the presentation arithmetic: clamping, the percentage,
 * and deciding which of four shapes a badge's progress actually IS. That is pure
 * and therefore the part worth unit-testing.
 *
 * Deliberately free of copy. Both the portal (Spanish, next-intl) and the kiosk
 * (English, no i18n provider yet) render this, so the shape carries a `unit`
 * discriminant and each surface supplies its own noun.
 */

/** The countable rules, plus the two all-or-nothing ones. Mirrors the CHECK
 *  constraint on badges.rule_kind in 20260808000000_gamification.sql. */
export type BadgeRuleKind =
  | "total_classes"
  | "streak_days"
  | "modality_classes"
  | "early_bird"
  | "night_owl"
  | "saturday_classes"
  | "perfect_month"
  | "gi_and_nogi_week";

/**
 * One row of member_badge_progress(), as it arrives from PostgREST.
 *
 * Every field is nullable because every field has a meaning when null:
 * `rule_kind` null = manual-only badge, the counters null = the rule is not a
 * count, `qualifies` null = the rule could not be evaluated (the fail-safe from
 * 20260808000600, which this preserves).
 */
export interface BadgeProgressRow {
  rule_kind: string | null;
  current_value: number | null;
  target_value: number | null;
  qualifies: boolean | null;
}

/** Which noun the counter is measured in. The caller owns the word itself. */
export type BadgeProgressUnit = "classes" | "days";

export type BadgeProgress =
  /**
   * A rule with a real denominator: "37 de 50 clases", drawn as a bar.
   * `current` is clamped into [0, target] so an off-by-one in the data can't
   * overflow the track or render a negative width.
   */
  | {
      kind: "counted";
      ruleKind: BadgeRuleKind;
      current: number;
      target: number;
      /** Integer 0–100, for the bar's width and its aria-valuetext. */
      percent: number;
      /** How many more are needed. 0 once the badge is due. */
      remaining: number;
      complete: boolean;
      unit: BadgeProgressUnit;
    }
  /**
   * All-or-nothing: "both styles in one week", "a perfect month". These have no
   * honest partial value — a perfect month is not 90% perfect — so they render
   * as a single milestone rather than a bar. See the SQL for why the counters
   * come back NULL instead of a fabricated fraction.
   */
  | { kind: "binary"; ruleKind: BadgeRuleKind; complete: boolean }
  /** rule_kind IS NULL: only the profe can award it. There is nothing to track. */
  | { kind: "manual" }
  /**
   * The rule exists but this build cannot put a number on it: a rule_kind the
   * database version doesn't implement, or a countable rule seeded without a
   * threshold. Rendered as the badge with no bar — the same direction the
   * awarding path fails in, which is "do nothing" rather than "show a zero".
   */
  | { kind: "indeterminate"; ruleKind: string | null };

/** Rules whose counter is a run of days rather than a pile of classes. */
const DAY_RULES: ReadonlySet<string> = new Set<BadgeRuleKind>(["streak_days"]);

/** Rules the SQL answers with a boolean and no denominator. */
const BINARY_RULES: ReadonlySet<string> = new Set<BadgeRuleKind>([
  "perfect_month",
  "gi_and_nogi_week",
]);

const COUNTED_RULES: ReadonlySet<string> = new Set<BadgeRuleKind>([
  "total_classes",
  "streak_days",
  "modality_classes",
  "early_bird",
  "night_owl",
  "saturday_classes",
]);

/**
 * Normalises one member_badge_progress row into a shape the UI can render.
 *
 * Never throws and never returns null: a badge whose rule this build doesn't
 * understand still has a name, an icon and a tier worth showing, so the caller
 * gets `indeterminate` rather than an exception on a page that is otherwise fine.
 */
export function badgeProgress(row: BadgeProgressRow | null | undefined): BadgeProgress {
  if (!row || row.rule_kind == null) return { kind: "manual" };

  const ruleKind = row.rule_kind;

  if (BINARY_RULES.has(ruleKind)) {
    return {
      kind: "binary",
      ruleKind: ruleKind as BadgeRuleKind,
      // `=== true`, not truthiness: NULL means "couldn't evaluate", and the safe
      // reading of that on a tracker is "not yet", the same as the award path.
      complete: row.qualifies === true,
    };
  }

  if (!COUNTED_RULES.has(ruleKind)) {
    return { kind: "indeterminate", ruleKind };
  }

  const target = row.target_value;
  // A countable rule with no threshold is a mis-seeded catalogue row. Dividing by
  // it would produce Infinity or NaN in the bar's width, so it is refused here
  // rather than clamped into a lie.
  if (target == null || !Number.isFinite(target) || target <= 0) {
    return { kind: "indeterminate", ruleKind };
  }

  const raw = row.current_value == null || !Number.isFinite(row.current_value)
    ? 0
    : row.current_value;
  const current = Math.max(0, Math.min(Math.floor(raw), Math.floor(target)));
  const wholeTarget = Math.floor(target);

  return {
    kind: "counted",
    ruleKind: ruleKind as BadgeRuleKind,
    current,
    target: wholeTarget,
    percent: Math.max(0, Math.min(100, Math.round((current / wholeTarget) * 100))),
    remaining: Math.max(0, wholeTarget - current),
    // Trust the database's verdict when it gave one. The clamp above means
    // `current === target` is also true the moment the raw count overshoots, but
    // "the counter is full" and "the badge is due" are different claims and only
    // the second one is the predicate's to make.
    complete: row.qualifies === true || current >= wholeTarget,
    unit: DAY_RULES.has(ruleKind) ? "days" : "classes",
  };
}

/**
 * The number a progress ring or bar should fill to, 0–100.
 *
 * Split out because three surfaces need it and two of them (the binary and
 * manual shapes) have no percentage of their own: a completed milestone is a
 * full bar, everything else with no counter is an empty one.
 */
export function badgeProgressPercent(progress: BadgeProgress): number {
  switch (progress.kind) {
    case "counted":
      return progress.percent;
    case "binary":
      return progress.complete ? 100 : 0;
    default:
      return 0;
  }
}

/**
 * How many badges a member may chase at once.
 *
 * This is a MIRROR, not the source of truth. The cap is enforced structurally by
 * `PRIMARY KEY (member_id, slot)` + `CHECK (slot BETWEEN 1 AND 3)` in
 * 20260816000000_tracked_badges_multi.sql, because a trigger that counts rows
 * loses to two concurrent inserts. What this constant buys is a picker that can
 * say "3 de 3" and disable itself, instead of letting a member tap a fourth badge
 * and reading them a database error.
 *
 * Changing it here alone does nothing. The CHECK is the other half.
 */
export const MAX_TRACKED_BADGES = 3;

/**
 * One tracked badge: which badge is being chased and how far along it is.
 *
 * `badge` is non-nullable — an entry that exists IS a goal. "No goals" is the
 * empty array, which is a state the list's container renders (a heading plus a
 * call to action) rather than something an individual tracker can express.
 *
 * Lives here rather than in supabase/types.ts because it is not a table shape:
 * it is a badge row joined to the output of badgeProgress() above, and it is what
 * both the portal action and the kiosk action return.
 *
 * The Badge import is type-only, so this module stays free of runtime imports and
 * remains safe to unit-test on its own.
 */
export interface TrackedBadgeEntry {
  badge: import("@/lib/supabase/types").Badge;
  progress: BadgeProgress;
}

/**
 * Whether the member has room for another goal.
 *
 * A named predicate rather than `list.length < 3` inlined at three call sites: the
 * portal disables its "add" button on it, the picker greys its rows on it, and the
 * server action refuses on it, and those three must agree.
 */
export function canTrackMore(tracked: readonly TrackedBadgeEntry[]): boolean {
  return tracked.length < MAX_TRACKED_BADGES;
}

/** Whether the tracker should show a bar at all. */
export function hasProgressBar(progress: BadgeProgress): progress is Extract<BadgeProgress, { kind: "counted" }> {
  return progress.kind === "counted";
}
