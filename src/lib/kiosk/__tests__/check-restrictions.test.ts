import { describe, it, expect } from "vitest";
import {
  checkRestrictions,
  memberAge,
  type RestrictionAudience,
  type RestrictionMember,
} from "../check-restrictions";

// Stable "now" for deterministic age math.
const NOW = new Date("2026-04-18T12:00:00Z");

// ── fixtures ───────────────────────────────────────────────────────────────

const adult: RestrictionMember = {
  birth_year: 1990,
  birth_month: 6,
  gender: "male",
};

const adultFemale: RestrictionMember = {
  birth_year: 1990,
  birth_month: 6,
  gender: "female",
};

const adultOther: RestrictionMember = {
  birth_year: 1990,
  birth_month: 6,
  gender: "other",
};

const child8: RestrictionMember = {
  birth_year: 2017,     // turns 9 in June 2026; on Apr 18 2026 they are 8
  birth_month: 6,
  gender: null,
};

const teen13: RestrictionMember = {
  birth_year: 2012,     // turns 14 in Jan 2026; on Apr 18 2026 they are 14
  birth_month: 1,
  gender: "male",
};

const unknownDob: RestrictionMember = {
  birth_year: null,
  birth_month: null,
  gender: "female",
};

// ── audience helpers ───────────────────────────────────────────────────────

const age7_10: RestrictionAudience = {
  kind: "age", name: "Age 7-10", min_age: 7, max_age: 10, gender: null,
};
const age11_16: RestrictionAudience = {
  kind: "age", name: "Age 11-16", min_age: 11, max_age: 16, gender: null,
};
const age40Plus: RestrictionAudience = {
  kind: "age", name: "Age 40+", min_age: 40, max_age: null, gender: null,
};
const womenOnly: RestrictionAudience = {
  kind: "gender", name: "Women Only", min_age: null, max_age: null, gender: "female",
};
const menOnly: RestrictionAudience = {
  kind: "gender", name: "Men Only", min_age: null, max_age: null, gender: "male",
};
const blackBelts: RestrictionAudience = {
  kind: "rank", name: "Black Belts Only", min_age: null, max_age: null, gender: null,
};
const inviteOnly: RestrictionAudience = {
  kind: "access", name: "Invite Only", min_age: null, max_age: null, gender: null,
};

// ── age checks ─────────────────────────────────────────────────────────────

describe("checkRestrictions — age", () => {
  it("empty audience list → null (open class)", () => {
    expect(checkRestrictions([], adult, NOW)).toBeNull();
  });

  it("surfaces when member's age is outside every age band", () => {
    // 36-year-old on a 7-10 class → warn
    expect(checkRestrictions([age7_10], adult, NOW)).toBe("Age 7-10");
  });

  it("null → when at least one age band includes the member", () => {
    // 14-year-old on 11-16 class → eligible
    expect(checkRestrictions([age11_16], teen13, NOW)).toBeNull();
  });

  it("multiple age bands — any-match wins", () => {
    // 14-year-old on a class for 7-10 OR 11-16 → eligible (matches 11-16)
    expect(checkRestrictions([age7_10, age11_16], teen13, NOW)).toBeNull();
  });

  it("open-ended upper bound (age 40+) — warns adults <40", () => {
    // 35-year-old on 40+ class → warn
    expect(checkRestrictions([age40Plus], adult, NOW)).toBe("Age 40+");
  });

  it("member with unknown DOB — age gates skipped, not surfaced", () => {
    // Unknown DOB → age gate contributes nothing; no other restrictions → null
    expect(checkRestrictions([age7_10], unknownDob, NOW)).toBeNull();
  });

  it("combined age band name reporting on fail", () => {
    // 8-year-old child on a combined 11-16 + 40+ class → both age bands
    // in the warning label, comma-separated.
    expect(checkRestrictions([age11_16, age40Plus], child8, NOW)).toBe("Age 11-16, Age 40+");
  });
});

// ── gender checks ──────────────────────────────────────────────────────────

describe("checkRestrictions — gender", () => {
  it("male on Women Only → warn", () => {
    expect(checkRestrictions([womenOnly], adult, NOW)).toBe("Women Only");
  });

  it("female on Women Only → null", () => {
    expect(checkRestrictions([womenOnly], adultFemale, NOW)).toBeNull();
  });

  it("'other' gender silently bypasses gender gates", () => {
    // Preserves pre-taxonomy behavior — don't warn when gender is ambiguous.
    expect(checkRestrictions([womenOnly], adultOther, NOW)).toBeNull();
  });

  it("multiple gender gates — any-match wins", () => {
    expect(checkRestrictions([womenOnly, menOnly], adult, NOW)).toBeNull();
  });
});

// ── rank / access (advisory) ───────────────────────────────────────────────

describe("checkRestrictions — rank and access are advisory", () => {
  it("rank audience always surfaces (no enforcement metadata)", () => {
    expect(checkRestrictions([blackBelts], adult, NOW)).toBe("Black Belts Only");
  });

  it("access audience always surfaces — matches pre-taxonomy invite_only", () => {
    expect(checkRestrictions([inviteOnly], adult, NOW)).toBe("Invite Only");
  });

  it("advisory stacks after age / gender fails", () => {
    // 8-year-old male child on an Age 11-16 + Invite Only class — both
    // surface in the modal, bullet-joined.
    expect(checkRestrictions([age11_16, inviteOnly], child8, NOW)).toBe("Age 11-16 \u2022 Invite Only");
  });

  it("eligibile adult on an invite-only class still sees advisory", () => {
    // No age restriction, male on Women Only would fail — add Invite
    // Only on top and the label joins: "Women Only • Invite Only".
    expect(checkRestrictions([womenOnly, inviteOnly], adult, NOW)).toBe("Women Only \u2022 Invite Only");
  });
});

// ── memberAge ───────────────────────────────────────────────────────────────

describe("memberAge", () => {
  it("returns null when birth year is unknown", () => {
    expect(memberAge(unknownDob, NOW)).toBeNull();
  });

  it("computes age from birth month+year relative to NOW", () => {
    expect(memberAge(adult, NOW)).toBe(35);  // born June 1990, now April 2026
  });

  it("subtracts a year when birthday hasn't happened yet this year", () => {
    const notYetThisYear: RestrictionMember = {
      birth_year: 1990, birth_month: 12, gender: null,  // birthday Dec
    };
    expect(memberAge(notYetThisYear, NOW)).toBe(35);  // Dec hasn't come yet in April 2026
  });

  it("doesn't subtract when birthday month is current / past", () => {
    const alreadyThisYear: RestrictionMember = {
      birth_year: 1990, birth_month: 4, gender: null,  // April
    };
    expect(memberAge(alreadyThisYear, NOW)).toBe(36);  // April 1990 → 36 in April 2026
  });
});
