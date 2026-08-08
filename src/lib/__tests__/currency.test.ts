import { describe, it, expect } from "vitest";
import {
  formatColones,
  formatColonesWithSign,
  parseColonesToCents,
} from "@/lib/currency";

describe("formatColones", () => {
  it("formats zero without a separator", () => {
    expect(formatColones(0)).toBe("0");
  });

  it("leaves sub-thousand amounts ungrouped", () => {
    expect(formatColones(50000)).toBe("500");   // ₡500
    expect(formatColones(100)).toBe("1");       // ₡1
    expect(formatColones(99900)).toBe("999");   // ₡999
  });

  it("groups thousands with a dot, not a comma", () => {
    // The whole point of not using the en-US default: 40000 colones is
    // "40.000" in Costa Rica and "40,000" in the US.
    expect(formatColones(4000000)).toBe("40.000");
    expect(formatColones(100000)).toBe("1.000");
    expect(formatColones(3500000)).toBe("35.000");
  });

  it("groups every three digits in millions", () => {
    expect(formatColones(150000000)).toBe("1.500.000");
    expect(formatColones(100000000)).toBe("1.000.000");
    expect(formatColones(1234567800)).toBe("12.345.678");
  });

  it("truncates céntimos rather than rounding them up", () => {
    // 99 céntimos must not become a whole extra colón: the displayed price has
    // to stay at or below what is stored.
    expect(formatColones(4000099)).toBe("40.000");
    expect(formatColones(50)).toBe("0");
    expect(formatColones(199)).toBe("1");
  });

  it("keeps the sign outside the grouping for negatives", () => {
    expect(formatColones(-150000)).toBe("-1.500");
    expect(formatColones(-50)).toBe("0"); // trunc, so no "-0"
  });

  it("degrades to 0 for non-finite input", () => {
    // A NaN price is a data bug, but rendering "NaN" on a public pricing card
    // is worse than rendering a zero.
    expect(formatColones(NaN)).toBe("0");
    expect(formatColones(Infinity)).toBe("0");
  });
});

describe("formatColonesWithSign", () => {
  it("prefixes the colón sign with no space", () => {
    expect(formatColonesWithSign(4000000)).toBe("₡40.000");
    expect(formatColonesWithSign(0)).toBe("₡0");
  });
});

describe("parseColonesToCents", () => {
  it("parses plain digits", () => {
    expect(parseColonesToCents("40000")).toBe(4000000);
    expect(parseColonesToCents("0")).toBe(0);
  });

  it("treats dots as grouping, not as a decimal point", () => {
    // The regression this function exists for: parseFloat("40.000") === 40,
    // which would store ₡40 instead of ₡40.000.
    expect(parseColonesToCents("40.000")).toBe(4000000);
    expect(parseColonesToCents("1.500.000")).toBe(150000000);
  });

  it("tolerates a leading sign and surrounding whitespace", () => {
    expect(parseColonesToCents("  ₡35.000 ")).toBe(3500000);
    expect(parseColonesToCents("₡500")).toBe(50000);
  });

  it("round-trips through formatColones", () => {
    for (const cents of [0, 50000, 4000000, 150000000]) {
      expect(parseColonesToCents(formatColones(cents))).toBe(cents);
    }
  });

  it("returns null for input it cannot read", () => {
    expect(parseColonesToCents("")).toBeNull();
    expect(parseColonesToCents("   ")).toBeNull();
    expect(parseColonesToCents("abc")).toBeNull();
    expect(parseColonesToCents("40,000")).toBeNull();  // comma is not our separator
    expect(parseColonesToCents("-")).toBeNull();
  });

  it("rejects a dot that isn't a thousands group", () => {
    // Stripping the dot from "40000.5" would yield 400005 — ten times the
    // intended price. Ambiguous input is refused rather than guessed at.
    expect(parseColonesToCents("40000.5")).toBeNull();
    expect(parseColonesToCents("40.00")).toBeNull();
    expect(parseColonesToCents("4.0000")).toBeNull();
    expect(parseColonesToCents("40000.000")).toBeNull(); // 5 leading digits
  });
});
