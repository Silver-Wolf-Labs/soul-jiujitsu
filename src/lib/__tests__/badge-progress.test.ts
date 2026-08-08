import { describe, it, expect } from "vitest";
import {
  badgeProgress,
  badgeProgressPercent,
  hasProgressBar,
  type BadgeProgressRow,
} from "../badge-progress";

/**
 * badgeProgress() is the seam between the SQL rule engine and the progress bar.
 * The rules themselves are not tested here — they live in
 * member_badge_progress() and are shared with the awarding path on purpose (see
 * 20260814000000). What is tested is the contract at the boundary, because every
 * one of these cases is a real row shape the database can return, and three of
 * them are the ones that would put a NaN width or a permanently-full bar on a
 * member's screen.
 */

/** A countable row, with the fields under test overridable. */
function row(over: Partial<BadgeProgressRow> = {}): BadgeProgressRow {
  return {
    rule_kind: "total_classes",
    current_value: 37,
    target_value: 50,
    qualifies: false,
    ...over,
  };
}

describe("badgeProgress — counted rules", () => {
  it("reports current, target, percent and remaining", () => {
    const p = badgeProgress(row());
    expect(p).toMatchObject({
      kind: "counted",
      ruleKind: "total_classes",
      current: 37,
      target: 50,
      percent: 74,
      remaining: 13,
      complete: false,
      unit: "classes",
    });
  });

  it("measures streak_days in days, not classes", () => {
    // The only rule whose counter is a run of days. The unit is a discriminant
    // rather than a word because the portal and the kiosk say it in different
    // languages.
    const p = badgeProgress(row({ rule_kind: "streak_days", current_value: 4, target_value: 10 }));
    expect(p.kind === "counted" && p.unit).toBe("days");
  });

  it.each([
    "total_classes",
    "modality_classes",
    "early_bird",
    "night_owl",
    "saturday_classes",
  ])("measures %s in classes", (kind) => {
    const p = badgeProgress(row({ rule_kind: kind }));
    expect(p.kind === "counted" && p.unit).toBe("classes");
  });

  it("clamps an overshooting count to the target", () => {
    // A member can pass the threshold before the award runs — the badge is granted
    // on check-in, and reconcile can lag. 60/50 would render a bar 120% wide,
    // spilling out of its rounded track.
    const p = badgeProgress(row({ current_value: 60, qualifies: true }));
    expect(p).toMatchObject({ current: 50, target: 50, percent: 100, remaining: 0, complete: true });
  });

  it("floors a negative count at zero rather than drawing a negative bar", () => {
    const p = badgeProgress(row({ current_value: -3 }));
    expect(p).toMatchObject({ current: 0, percent: 0, remaining: 50 });
  });

  it("treats a null count as zero", () => {
    // Reachable if the counting subquery returns NULL rather than 0 for a member
    // with no check-ins at all.
    const p = badgeProgress(row({ current_value: null }));
    expect(p).toMatchObject({ kind: "counted", current: 0, percent: 0, remaining: 50 });
  });

  it("trusts the database's verdict when the counter is short of the target", () => {
    // qualifies=true with current<target should not happen, but if the predicate
    // and the counter ever disagree, the predicate is the one that decides whether
    // the badge is awarded — so it is the one the UI must not contradict.
    const p = badgeProgress(row({ current_value: 49, qualifies: true }));
    expect(p.kind === "counted" && p.complete).toBe(true);
  });

  it("is complete once the counter reaches the target even before the award runs", () => {
    // The award happens on the next check-in; saying "faltan 0 clases" while
    // claiming it isn't done would be the confusing half of that gap.
    const p = badgeProgress(row({ current_value: 50, qualifies: false }));
    expect(p.kind === "counted" && p.complete).toBe(true);
  });

  it("rounds the percentage to a whole number", () => {
    const p = badgeProgress(row({ current_value: 1, target_value: 3 }));
    expect(p.kind === "counted" && p.percent).toBe(33);
  });
});

describe("badgeProgress — the rules with no denominator", () => {
  it.each(["perfect_month", "gi_and_nogi_week"])("reports %s as binary", (kind) => {
    // A perfect month is not 90% perfect. The SQL returns NULL counters for these
    // rather than inventing a fraction, and the UI shows a sentence, not a bar.
    const p = badgeProgress({
      rule_kind: kind,
      current_value: null,
      target_value: null,
      qualifies: false,
    });
    expect(p).toEqual({ kind: "binary", ruleKind: kind, complete: false });
  });

  it("marks a binary rule complete only on an explicit true", () => {
    const done = badgeProgress({
      rule_kind: "perfect_month",
      current_value: null,
      target_value: null,
      qualifies: true,
    });
    expect(done.kind === "binary" && done.complete).toBe(true);

    // NULL is "couldn't evaluate", which reads as "not yet" on a tracker — the
    // same direction the awarding path fails in (20260808000600).
    const unknown = badgeProgress({
      rule_kind: "gi_and_nogi_week",
      current_value: null,
      target_value: null,
      qualifies: null,
    });
    expect(unknown.kind === "binary" && unknown.complete).toBe(false);
  });
});

describe("badgeProgress — nothing to track", () => {
  it("reports a NULL rule_kind as manual", () => {
    // The profe awards "primera sumisión" by hand. There is no rule, so there is
    // no progress — not zero progress.
    const p = badgeProgress(row({ rule_kind: null }));
    expect(p).toEqual({ kind: "manual" });
  });

  it("reports a missing row as manual rather than throwing", () => {
    // The RPC returns no rows for a badge id that doesn't exist. A portal page
    // that renders fine without a tracker must not 500 over one.
    expect(badgeProgress(null)).toEqual({ kind: "manual" });
    expect(badgeProgress(undefined)).toEqual({ kind: "manual" });
  });

  it("reports an unrecognised rule_kind as indeterminate", () => {
    // The database's CHECK constraint can gain a rule_kind before this build
    // knows about it. Showing the badge with no bar beats a bar stuck at zero,
    // which reads as broken.
    const p = badgeProgress(row({ rule_kind: "future_rule_kind" }));
    expect(p).toEqual({ kind: "indeterminate", ruleKind: "future_rule_kind" });
  });

  it.each([null, 0, -5])(
    "refuses to divide by a target of %s",
    (target) => {
      // A countable badge seeded without a threshold. Dividing by it yields
      // Infinity or NaN in the bar's width — refused rather than clamped into a
      // number that looks meaningful.
      const p = badgeProgress(row({ target_value: target }));
      expect(p).toEqual({ kind: "indeterminate", ruleKind: "total_classes" });
    }
  );
});

describe("badgeProgressPercent", () => {
  it("passes through a counted percentage", () => {
    expect(badgeProgressPercent(badgeProgress(row()))).toBe(74);
  });

  it("is all or nothing for a binary rule", () => {
    const base = { rule_kind: "perfect_month", current_value: null, target_value: null };
    expect(badgeProgressPercent(badgeProgress({ ...base, qualifies: true }))).toBe(100);
    expect(badgeProgressPercent(badgeProgress({ ...base, qualifies: false }))).toBe(0);
  });

  it("is zero for the shapes with no counter", () => {
    expect(badgeProgressPercent({ kind: "manual" })).toBe(0);
    expect(badgeProgressPercent({ kind: "indeterminate", ruleKind: null })).toBe(0);
  });
});

describe("hasProgressBar", () => {
  it("is true only for counted progress", () => {
    expect(hasProgressBar(badgeProgress(row()))).toBe(true);
    expect(hasProgressBar({ kind: "manual" })).toBe(false);
    expect(hasProgressBar({ kind: "binary", ruleKind: "perfect_month", complete: true })).toBe(false);
    expect(hasProgressBar({ kind: "indeterminate", ruleKind: "x" })).toBe(false);
  });
});
