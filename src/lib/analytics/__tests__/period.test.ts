/**
 * Pure-function tests for period normalization.
 *
 * We mock `getGymTz` with a stable timezone so anchor-based dates are
 * deterministic across runners. Everything else is integer math and can be
 * asserted directly.
 */

import { describe, expect, it, vi } from "vitest";

// Mock the gym timezone lookup so `buildPeriod` doesn't hit Supabase.
vi.mock("@/lib/gym-time", () => ({
  getGymTz: async () => "America/Chicago",
}));

import {
  addDays,
  daysBetween,
  pgDowFromIso,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  buildPeriod,
  previousPeriod,
  computeDelta,
} from "@/lib/analytics/period";

describe("addDays", () => {
  it("adds positive days without TZ drift", () => {
    expect(addDays("2026-01-01", 5)).toBe("2026-01-06");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });

  it("subtracts days cleanly across year boundaries", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("daysBetween", () => {
  it("is inclusive of both ends", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2026-01-07")).toBe(7);
  });
});

describe("pgDowFromIso", () => {
  it("returns 1..7 with Monday=1 and Sunday=7", () => {
    // 2026-04-13 is a Monday.
    expect(pgDowFromIso("2026-04-13")).toBe(1);
    expect(pgDowFromIso("2026-04-14")).toBe(2); // Tue
    expect(pgDowFromIso("2026-04-19")).toBe(7); // Sun
  });
});

describe("startOfWeek", () => {
  it("snaps to the Monday of the containing week", () => {
    // 2026-04-18 is a Saturday — its Monday is 2026-04-13.
    expect(startOfWeek("2026-04-18")).toBe("2026-04-13");
    expect(startOfWeek("2026-04-13")).toBe("2026-04-13");
    expect(startOfWeek("2026-04-19")).toBe("2026-04-13"); // Sunday still same Monday
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("covers leap years and 31-day months", () => {
    expect(startOfMonth("2026-04-18")).toBe("2026-04-01");
    expect(endOfMonth("2026-04-18")).toBe("2026-04-30");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2026-01-15")).toBe("2026-01-31");
  });
});

describe("startOfQuarter / endOfQuarter", () => {
  it("maps months to their quarter bounds", () => {
    expect(startOfQuarter("2026-04-18")).toBe("2026-04-01"); // Q2
    expect(endOfQuarter("2026-04-18")).toBe("2026-06-30");
    expect(startOfQuarter("2026-01-15")).toBe("2026-01-01"); // Q1
    expect(endOfQuarter("2026-01-15")).toBe("2026-03-31");
    expect(startOfQuarter("2026-12-31")).toBe("2026-10-01"); // Q4
    expect(endOfQuarter("2026-12-31")).toBe("2026-12-31");
  });
});

describe("buildPeriod", () => {
  it("defaults to 'week' anchored at the gym-today Monday", async () => {
    const p = await buildPeriod({}, "2026-04-18"); // Sat → week starts Mon the 13th
    expect(p.label).toBe("week");
    expect(p.start).toBe("2026-04-13");
    expect(p.end).toBe("2026-04-19");
  });

  it("honors month/quarter labels", async () => {
    const month = await buildPeriod({ label: "month" }, "2026-04-18");
    expect(month.start).toBe("2026-04-01");
    expect(month.end).toBe("2026-04-30");

    const quarter = await buildPeriod({ label: "quarter" }, "2026-04-18");
    expect(quarter.start).toBe("2026-04-01");
    expect(quarter.end).toBe("2026-06-30");
  });

  it("treats 'year' as YTD (not full calendar year)", async () => {
    // Old behavior was Jan 1 → Dec 31; the empty trailing months painted
    // dead space onto the trend chart. YTD stops at today.
    const year = await buildPeriod({ label: "year" }, "2026-04-18");
    expect(year.start).toBe("2026-01-01");
    expect(year.end).toBe("2026-04-18");
  });

  it("produces rolling last_6_months / last_12_months windows", async () => {
    const six = await buildPeriod({ label: "last_6_months" }, "2026-04-18");
    expect(six.end).toBe("2026-04-18");
    expect(six.start).toBe("2025-10-18");

    const twelve = await buildPeriod({ label: "last_12_months" }, "2026-04-18");
    expect(twelve.end).toBe("2026-04-18");
    expect(twelve.start).toBe("2025-04-18");
  });

  it("accepts custom ranges and validates bounds", async () => {
    const custom = await buildPeriod({ label: "custom", start: "2026-03-01", end: "2026-03-07" });
    expect(custom).toMatchObject({ start: "2026-03-01", end: "2026-03-07", label: "custom" });

    await expect(buildPeriod({ label: "custom" })).rejects.toThrow(/start.*end/i);
    await expect(
      buildPeriod({ label: "custom", start: "2026-03-10", end: "2026-03-01" }),
    ).rejects.toThrow(/start.*end/i);
  });
});

describe("previousPeriod", () => {
  it("steps a week back by exactly 7 days", () => {
    const period = { label: "week" as const, start: "2026-04-13", end: "2026-04-19", tz: "America/Chicago" };
    expect(previousPeriod(period)).toMatchObject({ start: "2026-04-06", end: "2026-04-12" });
  });

  it("steps a month back by a full calendar month (not 30 days)", () => {
    const period = { label: "month" as const, start: "2026-04-01", end: "2026-04-30", tz: "America/Chicago" };
    expect(previousPeriod(period)).toMatchObject({ start: "2026-03-01", end: "2026-03-31" });
  });

  it("produces YTD comparison for year (same elapsed days last year)", () => {
    // YTD spans 108 days (Jan 1 → Apr 18 inclusive). Prior-year
    // comparison is Jan 1 → Apr 18 of 2025 — same elapsed window.
    const period = { label: "year" as const, start: "2026-01-01", end: "2026-04-18", tz: "America/Chicago" };
    expect(previousPeriod(period)).toMatchObject({
      start: "2025-01-01",
      end:   "2025-04-18",
    });
  });

  it("rolls last_6_months / last_12_months back by their own span", () => {
    // Oct 18 2025 → Apr 18 2026 inclusive = 183 days. Previous window
    // ends the day before the current start (Oct 17 2025) and begins
    // 182 days earlier — Apr 18 2025.
    const six = { label: "last_6_months" as const, start: "2025-10-18", end: "2026-04-18", tz: "America/Chicago" };
    expect(previousPeriod(six)).toMatchObject({ start: "2025-04-18", end: "2025-10-17" });
  });
});

describe("computeDelta", () => {
  it("handles the no-comparison branch (previous === null)", () => {
    expect(computeDelta(5, null)).toEqual({
      value: 5,
      deltaAbs: null,
      deltaPct: null,
      direction: null,
    });
  });

  it("computes percent and direction", () => {
    const d = computeDelta(110, 100);
    expect(d.value).toBe(110);
    expect(d.deltaAbs).toBe(10);
    expect(d.deltaPct).toBeCloseTo(0.1, 5);
    expect(d.direction).toBe("up");
  });

  it("avoids /0 misinformation — percentage is null when previous=0", () => {
    const d = computeDelta(5, 0);
    expect(d.deltaAbs).toBe(5);
    expect(d.deltaPct).toBeNull();
    expect(d.direction).toBe("up");
  });

  it("flat direction when values match", () => {
    expect(computeDelta(7, 7).direction).toBe("flat");
  });
});
