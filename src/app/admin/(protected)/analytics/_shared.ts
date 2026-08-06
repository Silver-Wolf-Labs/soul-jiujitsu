import type { Period, PeriodLabel } from "@/lib/analytics/types";

const PERIODS: PeriodLabel[] = [
  "week",
  "month",
  "quarter",
  "year",
  "last_6_months",
  "last_12_months",
  "custom",
];

/**
 * Parse the admin-chosen period out of URL query params. Anything unknown
 * falls back to "week", matching the product default.
 */
export function readPeriodFromSearch(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): { label: PeriodLabel; start?: string; end?: string } {
  const raw = searchParams?.period;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const label = PERIODS.includes(value as PeriodLabel) ? (value as PeriodLabel) : "week";
  if (label === "custom") {
    const start = Array.isArray(searchParams?.start) ? searchParams?.start[0] : searchParams?.start;
    const end = Array.isArray(searchParams?.end) ? searchParams?.end[0] : searchParams?.end;
    return { label, start, end };
  }
  return { label };
}

/**
 * Human-readable range label: "Apr 14 – Apr 20, 2026".
 * Dates are rendered in the gym's locale-friendly short form.
 */
export function formatRangeLabel(period: Period): string {
  const [sy, sm, sd] = period.start.split("-").map(Number);
  const [ey, em, ed] = period.end.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (sy === ey) return `${fmt(start)} – ${fmt(end)}, ${ey}`;
  return `${fmt(start)}, ${sy} – ${fmt(end)}, ${ey}`;
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
