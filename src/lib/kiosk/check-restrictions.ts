/**
 * Pure eligibility-check logic for the kiosk class picker, extracted so
 * it's unit-testable in isolation. See
 * `src/app/kiosk/checkin/page.tsx` for the UI that consumes it.
 *
 * This is NOT an authorization fence. The kiosk calls `checkRestrictions`
 * to decide whether to show the `RestrictionWarning` modal; the member
 * can always click "Check In Anyway" to proceed. That warn-with-override
 * behavior is preserved verbatim from the pre-taxonomy implementation —
 * only the data source changed (scalar columns → audience junction).
 */

export type AudienceKind = "age" | "gender" | "rank" | "access";

export interface RestrictionAudience {
  kind: AudienceKind;
  name: string;
  min_age: number | null;
  max_age: number | null;
  gender: "female" | "male" | null;
}

export interface RestrictionMember {
  birth_month: number | null;
  birth_year: number | null;
  /** Member-reported gender. Runtime only consults "male" and "female"
   *  for gender-gate matching; "other" / "prefer_not_to_say" / null /
   *  any other string all silently bypass gender audiences (matches the
   *  pre-taxonomy implementation's KioskMember.gender: string | null
   *  shape). Widened from the canonical enum so the kiosk page can pass
   *  `KioskMember` directly without a narrowing cast. */
  gender: string | null;
}

/**
 * Age in whole years on today's date, or `null` when DOB is unknown.
 * Exported so the kiosk UI can also consume this for display (matches
 * the same "only surface age when we know it" convention the page uses).
 */
export function memberAge(m: RestrictionMember, now: Date = new Date()): number | null {
  if (m.birth_year == null || m.birth_month == null) return null;
  let age = now.getFullYear() - m.birth_year;
  // If the member's birth month hasn't arrived yet this year, roll back.
  // We don't have the day, so we treat "this month or any prior month" as
  // already celebrated — which matches the pre-taxonomy implementation.
  if (now.getMonth() + 1 < m.birth_month) age -= 1;
  return age;
}

/**
 * Build a one-line restriction label when the member fails at least one
 * audience gate. Returns `null` when every audience allows the member.
 *
 * Semantics preserved from the pre-taxonomy scalar implementation:
 *  - `age` audiences surface when the member's known age is outside
 *    every age band on the slot.
 *  - `gender` audiences surface when the member's gender is "male" or
 *    "female" (never "other" / "prefer_not_to_say") and doesn't match
 *    any gender gate on the slot.
 *  - `rank` and `access` audiences are advisory — their presence on a
 *    slot always surfaces in the modal, matching the pre-taxonomy
 *    `invite_only` behavior. No enforcement metadata at the DB level.
 *
 * Separator ` • ` (U+2022) matches the joiner the page used pre-refactor.
 */
export function checkRestrictions(
  audiences: RestrictionAudience[],
  member: RestrictionMember,
  now: Date = new Date(),
): string | null {
  if (!audiences || audiences.length === 0) return null;

  const reasons: string[] = [];
  const age = memberAge(member, now);

  const ageAudiences = audiences.filter(a => a.kind === "age");
  if (age !== null && ageAudiences.length > 0) {
    const anyEligible = ageAudiences.some(a =>
      (a.min_age == null || age >= a.min_age) &&
      (a.max_age == null || age <= a.max_age)
    );
    if (!anyEligible) {
      reasons.push(ageAudiences.map(a => a.name).join(", "));
    }
  }

  const genderAudiences = audiences.filter(a => a.kind === "gender");
  if (
    genderAudiences.length > 0 &&
    member.gender &&
    member.gender !== "other" &&
    member.gender !== "prefer_not_to_say"
  ) {
    const matches = genderAudiences.some(a => a.gender === member.gender);
    if (!matches) {
      reasons.push(genderAudiences.map(a => a.name).join(", "));
    }
  }

  const advisory = audiences
    .filter(a => a.kind === "rank" || a.kind === "access")
    .map(a => a.name);
  reasons.push(...advisory);

  return reasons.length === 0 ? null : reasons.join(" \u2022 ");
}
