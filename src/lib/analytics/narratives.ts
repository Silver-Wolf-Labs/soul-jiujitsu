/**
 * Deterministic, rule-based narrative callouts.
 *
 * These are the one-line summaries that sit above charts — "Attendance up
 * 12% vs last week", "Tuesday 6 PM is your busiest slot". No LLM. Every
 * rule is a pure function that returns `Narrative | null` so the UI can
 * trivially filter out empties.
 *
 * Rules stay factual. The tone was explicitly chosen by the product owner:
 * trust > warmth. Don't congratulate, don't catastrophize — state the
 * number and let the admin decide what to do.
 *
 * Each rule takes a typed input bag; adding a new rule should require only
 * a new entry here and (optionally) a new field on the input bag.
 */

import type { KpiDelta, Narrative } from "@/lib/analytics/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function periodWord(label: string): string {
  if (label === "week") return "week";
  if (label === "month") return "month";
  if (label === "quarter") return "quarter";
  if (label === "year") return "year";
  return "period";
}

function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12} ${ampm}`;
}

function pct(n: number): string {
  return `${Math.abs(Math.round(n * 100))}%`;
}

// ─── Rules ──────────────────────────────────────────────────────────────────

export interface OverviewInput {
  periodLabel: string;
  checkIns: KpiDelta;
  atRisk: KpiDelta;
  netGrowth: KpiDelta;
}

export function buildOverviewNarratives(i: OverviewInput): Narrative[] {
  const out: Narrative[] = [];

  // Check-in momentum — only fires with a real delta and ≥5% change.
  if (
    i.checkIns.deltaPct != null &&
    Math.abs(i.checkIns.deltaPct) >= 0.05 &&
    i.checkIns.direction
  ) {
    const dir = i.checkIns.direction === "up" ? "up" : "down";
    out.push({
      severity: i.checkIns.direction === "up" ? "good" : "warning",
      text: `Check-ins are ${dir} ${pct(i.checkIns.deltaPct)} vs last ${periodWord(i.periodLabel)}.`,
    });
  }

  // At-risk pool — surface anytime it's non-zero so nothing slips through.
  if (i.atRisk.value > 0) {
    out.push({
      severity: "warning",
      text: `${i.atRisk.value} member${i.atRisk.value === 1 ? " has" : "s have"} not checked in for 14+ days.`,
    });
  }

  // Net growth — negative signals attrition; positive is informational.
  if (i.netGrowth.value < 0) {
    out.push({
      severity: "danger",
      text: `Net growth is ${i.netGrowth.value} this ${periodWord(i.periodLabel)} (${Math.abs(i.netGrowth.value)} more canceled than joined).`,
    });
  } else if (i.netGrowth.value > 0) {
    out.push({
      severity: "good",
      text: `Net growth is +${i.netGrowth.value} this ${periodWord(i.periodLabel)}.`,
    });
  }

  return out;
}

export interface AttendanceInput {
  periodLabel: string;
  totalCheckIns: KpiDelta;
  topClassName: string | null;
  topClassCount: number;
  peakSlot: { day: number; hour: number; count: number } | null;
  peakSlotAvgCount: number;
}

export function buildAttendanceNarratives(i: AttendanceInput): Narrative[] {
  const out: Narrative[] = [];

  // Same momentum rule as Overview but scoped to attendance.
  if (
    i.totalCheckIns.deltaPct != null &&
    Math.abs(i.totalCheckIns.deltaPct) >= 0.05 &&
    i.totalCheckIns.direction
  ) {
    const dir = i.totalCheckIns.direction === "up" ? "up" : "down";
    out.push({
      severity: i.totalCheckIns.direction === "up" ? "good" : "warning",
      text: `Total check-ins are ${dir} ${pct(i.totalCheckIns.deltaPct)} vs last ${periodWord(i.periodLabel)}.`,
    });
  }

  // Peak slot — only fires when the peak meaningfully beats the average
  // (≥50% above mean) so we don't declare every quiet day "the busiest slot".
  if (i.peakSlot && i.peakSlotAvgCount > 0 && i.peakSlot.count / i.peakSlotAvgCount >= 1.5) {
    out.push({
      severity: "info",
      text: `${DAY_NAMES[i.peakSlot.day - 1]} ${formatHour(i.peakSlot.hour)} is the busiest recurring slot (${i.peakSlot.count} check-ins).`,
    });
  }

  // Top class callout — useful when the #1 is clearly ahead (>30% of total).
  if (i.topClassName && i.topClassCount > 0 && i.totalCheckIns.value > 0) {
    const share = i.topClassCount / i.totalCheckIns.value;
    if (share >= 0.3) {
      out.push({
        severity: "info",
        text: `${i.topClassName} accounts for ${pct(share)} of check-ins this ${periodWord(i.periodLabel)}.`,
      });
    }
  }

  return out;
}

export interface MembersInput {
  periodLabel: string;
  mostConsistentName: string | null;
  mostConsistentCount: number;
  atRiskCount: number;
  newMembersCount: number;
}

export function buildMembersNarratives(i: MembersInput): Narrative[] {
  const out: Narrative[] = [];

  if (i.mostConsistentName && i.mostConsistentCount > 0) {
    out.push({
      severity: "good",
      text: `${i.mostConsistentName} leads with ${i.mostConsistentCount} check-in${i.mostConsistentCount === 1 ? "" : "s"} this ${periodWord(i.periodLabel)}.`,
    });
  }

  if (i.atRiskCount > 0) {
    out.push({
      severity: "warning",
      text: `${i.atRiskCount} member${i.atRiskCount === 1 ? "" : "s"} haven't checked in for 14+ days.`,
    });
  }

  if (i.newMembersCount > 0) {
    out.push({
      severity: "info",
      text: `${i.newMembersCount} new member${i.newMembersCount === 1 ? "" : "s"} joined this ${periodWord(i.periodLabel)}.`,
    });
  }

  return out;
}

export interface InstructorsInput {
  periodLabel: string;
  topInstructorName: string | null;
  topInstructorAttendance: number;
  leaderCount: number;
  unassignedAttendance: number;
  totalAttendance: number;
}

export function buildInstructorsNarratives(i: InstructorsInput): Narrative[] {
  const out: Narrative[] = [];

  if (i.topInstructorName && i.topInstructorAttendance > 0) {
    out.push({
      severity: "good",
      text: `${i.topInstructorName} leads with ${i.topInstructorAttendance} check-ins this ${periodWord(i.periodLabel)}.`,
    });
  }

  // Warn if a non-trivial share of attendance is attributed to "Unassigned"
  // — that's typically manual entries or schedule slots missing an
  // instructor name. Actionable cleanup.
  if (i.totalAttendance > 0) {
    const share = i.unassignedAttendance / i.totalAttendance;
    if (share >= 0.1 && i.unassignedAttendance > 0) {
      out.push({
        severity: "warning",
        text: `${pct(share)} of check-ins have no instructor attached — link a teacher to those classes to improve reporting.`,
      });
    }
  }

  if (i.leaderCount === 0) {
    out.push({
      severity: "info",
      text: "No instructor activity in this period yet.",
    });
  }

  return out;
}
