import { describe, expect, it } from "vitest";
import {
  buildOverviewNarratives,
  buildAttendanceNarratives,
  buildMembersNarratives,
  buildInstructorsNarratives,
} from "@/lib/analytics/narratives";
import type { KpiDelta } from "@/lib/analytics/types";

// Tiny helper so the tests don't drown in KpiDelta literals.
function kpi(value: number, prev: number | null = null): KpiDelta {
  if (prev == null) {
    return { value, deltaAbs: null, deltaPct: null, direction: null };
  }
  const deltaAbs = value - prev;
  const deltaPct = prev === 0 ? null : deltaAbs / prev;
  const direction = deltaAbs > 0 ? "up" : deltaAbs < 0 ? "down" : "flat";
  return { value, deltaAbs, deltaPct, direction };
}

describe("buildOverviewNarratives", () => {
  it("stays silent when nothing meaningful changed", () => {
    const out = buildOverviewNarratives({
      periodLabel: "week",
      checkIns: kpi(100, 100),
      atRisk: kpi(0),
      netGrowth: kpi(0, 0),
    });
    // 0 delta + 0 at-risk + 0 net growth = no narratives.
    expect(out).toEqual([]);
  });

  it("announces a ≥5% check-in delta with direction", () => {
    const out = buildOverviewNarratives({
      periodLabel: "week",
      checkIns: kpi(115, 100),
      atRisk: kpi(0),
      netGrowth: kpi(0, 0),
    });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("good");
    expect(out[0].text).toContain("up 15%");
    expect(out[0].text).toContain("week");
  });

  it("does not announce sub-5% noise", () => {
    const out = buildOverviewNarratives({
      periodLabel: "week",
      checkIns: kpi(103, 100), // +3%
      atRisk: kpi(0),
      netGrowth: kpi(0, 0),
    });
    expect(out).toEqual([]);
  });

  it("surfaces non-zero at-risk with a warning", () => {
    const out = buildOverviewNarratives({
      periodLabel: "month",
      checkIns: kpi(100, 100),
      atRisk: kpi(5),
      netGrowth: kpi(0, 0),
    });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].text).toMatch(/5 members have not/);
  });

  it("grammars a single at-risk member correctly", () => {
    const out = buildOverviewNarratives({
      periodLabel: "week",
      checkIns: kpi(0),
      atRisk: kpi(1),
      netGrowth: kpi(0, 0),
    });
    expect(out[0].text).toMatch(/1 member has not/);
  });

  it("flags negative net growth as danger", () => {
    const out = buildOverviewNarratives({
      periodLabel: "month",
      checkIns: kpi(100, 100),
      atRisk: kpi(0),
      netGrowth: kpi(-3, 0),
    });
    expect(out[0].severity).toBe("danger");
    expect(out[0].text).toContain("-3");
    expect(out[0].text).toContain("canceled than joined");
  });
});

describe("buildAttendanceNarratives", () => {
  it("only declares a peak slot when it's ≥50% above the mean", () => {
    const quiet = buildAttendanceNarratives({
      periodLabel: "week",
      totalCheckIns: kpi(100, 100),
      topClassName: null,
      topClassCount: 0,
      peakSlot: { day: 2, hour: 18, count: 10 },
      peakSlotAvgCount: 9, // 10/9 = 1.11 — not enough
    });
    expect(quiet.some(n => n.text.includes("busiest"))).toBe(false);

    const clear = buildAttendanceNarratives({
      periodLabel: "week",
      totalCheckIns: kpi(100, 100),
      topClassName: null,
      topClassCount: 0,
      peakSlot: { day: 2, hour: 18, count: 20 },
      peakSlotAvgCount: 8, // 20/8 = 2.5 — clearly peak
    });
    expect(clear.some(n => n.text.startsWith("Tue 6 PM"))).toBe(true);
  });

  it("calls out a top class only when it's ≥30% of total", () => {
    const dominated = buildAttendanceNarratives({
      periodLabel: "month",
      totalCheckIns: kpi(100, 100),
      topClassName: "Gi",
      topClassCount: 40,
      peakSlot: null,
      peakSlotAvgCount: 0,
    });
    expect(dominated.some(n => n.text.includes("Gi") && n.text.includes("40%"))).toBe(true);

    const spread = buildAttendanceNarratives({
      periodLabel: "month",
      totalCheckIns: kpi(100, 100),
      topClassName: "Gi",
      topClassCount: 15, // 15%
      peakSlot: null,
      peakSlotAvgCount: 0,
    });
    expect(spread.some(n => n.text.includes("Gi"))).toBe(false);
  });
});

describe("buildMembersNarratives", () => {
  it("congratulates the consistency leader when present", () => {
    const out = buildMembersNarratives({
      periodLabel: "week",
      mostConsistentName: "Alex",
      mostConsistentCount: 6,
      atRiskCount: 0,
      newMembersCount: 0,
    });
    expect(out[0].severity).toBe("good");
    expect(out[0].text).toContain("Alex leads with 6 check-ins");
  });

  it("renders nothing for the all-zero case", () => {
    expect(
      buildMembersNarratives({
        periodLabel: "week",
        mostConsistentName: null,
        mostConsistentCount: 0,
        atRiskCount: 0,
        newMembersCount: 0,
      }),
    ).toEqual([]);
  });
});

describe("buildInstructorsNarratives", () => {
  it("warns when >10% of attendance is Unassigned", () => {
    const out = buildInstructorsNarratives({
      periodLabel: "month",
      topInstructorName: "Walter",
      topInstructorAttendance: 80,
      leaderCount: 1,
      unassignedAttendance: 20,
      totalAttendance: 100,
    });
    expect(out.some(n => n.severity === "warning" && n.text.includes("no instructor"))).toBe(true);
  });

  it("falls silent when unassigned share is small", () => {
    const out = buildInstructorsNarratives({
      periodLabel: "month",
      topInstructorName: "Walter",
      topInstructorAttendance: 95,
      leaderCount: 1,
      unassignedAttendance: 5,
      totalAttendance: 100,
    });
    expect(out.some(n => n.text.includes("no instructor"))).toBe(false);
  });

  it("emits an info callout when there's no activity at all", () => {
    const out = buildInstructorsNarratives({
      periodLabel: "week",
      topInstructorName: null,
      topInstructorAttendance: 0,
      leaderCount: 0,
      unassignedAttendance: 0,
      totalAttendance: 0,
    });
    expect(out[0].severity).toBe("info");
    expect(out[0].text).toMatch(/No instructor activity/);
  });
});
