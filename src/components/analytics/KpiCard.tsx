import type { KpiDelta } from "@/lib/analytics/types";

interface Props {
  label: string;
  value: KpiDelta;
  /** Formatter for the main value. Default: locale int with thousands. */
  format?: (n: number) => string;
  /** When true, "up" means bad (e.g. "at-risk members" going up) — swaps
   *  the delta color palette. */
  invertDirection?: boolean;
  /** Short helper shown under the value. Keep one line. */
  hint?: string;
  /** Muted the delta row (no comparison data). */
  muted?: boolean;
}

/**
 * Scalar KPI card. Consistent dimensions across the suite so the top
 * strip of every dashboard scans as one row instead of a collage.
 *
 *   ┌─────────────────────────────┐
 *   │ LABEL                       │
 *   │ 1,234                       │
 *   │ ▲ +12%  vs last week        │
 *   └─────────────────────────────┘
 */
export default function KpiCard({ label, value, format, invertDirection, hint, muted }: Props) {
  const fmt = format ?? ((n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const hasDelta = value.deltaPct != null || value.deltaAbs != null;

  // Color the delta. "up" is green by default, red when inverted (e.g.
  // at-risk member count going up is bad news).
  const upGood = !invertDirection;
  const deltaClass =
    value.direction === null || !hasDelta
      ? "text-muted"
      : value.direction === "flat"
        ? "text-muted"
        : value.direction === "up"
          ? (upGood ? "text-success-dark" : "text-danger")
          : (upGood ? "text-danger" : "text-success-dark");

  const arrow = value.direction === "up" ? "▲" : value.direction === "down" ? "▼" : "•";

  return (
    <div className="bg-white border border-line rounded-lg p-4 flex flex-col gap-1 min-w-0">
      <div className="text-[11px] font-semibold tracking-wider uppercase text-muted truncate">
        {label}
      </div>
      <div className="font-display text-3xl text-black tabular-nums leading-none mt-0.5">
        {fmt(value.value)}
      </div>
      {hint ? (
        <div className="text-xs text-muted mt-0.5 truncate">{hint}</div>
      ) : null}
      <div className={`text-xs tabular-nums mt-1.5 ${deltaClass}`}>
        {muted || !hasDelta ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            <span className="inline-block w-3">{arrow}</span>
            {value.deltaPct != null
              ? ` ${value.deltaPct > 0 ? "+" : ""}${Math.round(value.deltaPct * 100)}%`
              : ` ${value.deltaAbs != null && value.deltaAbs > 0 ? "+" : ""}${value.deltaAbs ?? ""}`}
            <span className="text-muted ml-1.5">vs previous</span>
          </>
        )}
      </div>
    </div>
  );
}
