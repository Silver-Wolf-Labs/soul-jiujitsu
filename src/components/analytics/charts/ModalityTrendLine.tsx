"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { useState } from "react";

/**
 * One series per modality — consumes `AttendancePayload.modalityTrend`
 * (top-N capped server-side at 5 so the chart stays legible).
 *
 * The wire format is a list of `{ modalityId, name, color, points[] }`.
 * Recharts wants a single flat array keyed by the shared x-axis; we pivot
 * here so every date across every modality has one row with one column
 * per series key.
 */

interface ModalitySeries {
  modalityId: number | null;
  name: string;
  /** Owner-configured hex color from `class_modalities.color`. Falls
   *  back to the built-in palette when NULL. */
  color: string | null;
  points: { date: string; count: number }[];
}

interface Props {
  data: ModalitySeries[];
  height?: number;
}

// Neutral fallback palette for modalities whose `color` column is NULL.
// Tuned to be visually distinct from each other AND from the weekday
// palette on `StackedClassBar`, so when both charts share the page the
// colors don't read as the same dimension.
const FALLBACK_PALETTE = [
  "#0EA5E9", // sky
  "#F59E0B", // amber
  "#10B981", // emerald
  "#A855F7", // purple
  "#EF4444", // red
  "#64748B", // slate
];

export default function ModalityTrendLine({ data, height = 260 }: Props) {
  // Legend-hover highlight. When the user's pointer is over one legend
  // chip we dim the other lines so the focused series pops. `null` means
  // nothing hovered (default rendering). Click-to-pin is intentionally
  // omitted — hover is enough for comparison; click would compete with
  // Recharts' own "toggle this series off" click behavior.
  const [hoveredSeries, setHoveredSeries] = useState<number | null>(null);

  // Empty state — no modalities in the period means nothing to chart.
  if (data.length === 0 || data.every(s => s.points.length === 0)) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted"
        style={{ height }}
      >
        No modality attribution in this period.
      </div>
    );
  }

  // Pivot points → one row per date, one key per modality. Use the
  // series index to key the column so duplicate display names (rare, but
  // possible mid-rename) stay distinct on the chart.
  const seriesKey = (i: number) => `s${i}`;
  const dateSet = new Set<string>();
  for (const s of data) for (const p of s.points) dateSet.add(p.date);
  const dates = Array.from(dateSet).sort();
  const rows = dates.map(date => {
    const row: Record<string, string | number> = { date };
    data.forEach((s, i) => {
      const p = s.points.find(pt => pt.date === date);
      row[seriesKey(i)] = p?.count ?? 0;
    });
    return row;
  });

  // Year-aware tick formatting — matches the convention in `TrendLine`.
  const yearsInData = new Set<number>();
  for (const r of rows) if (typeof r.date === "string") yearsInData.add(Number(r.date.slice(0, 4)));
  const multiYear = yearsInData.size > 1;

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(iso: string) => formatIsoDateShort(iso, multiYear)}
            tick={{ fontSize: 11, fill: "var(--color-muted)" }}
            axisLine={{ stroke: "var(--color-line)" }}
            tickLine={false}
            minTickGap={multiYear ? 56 : 24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-muted)" }}
            axisLine={false}
            tickLine={false}
            width={36}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "white",
              border: "1px solid var(--color-line)",
              borderRadius: 6,
              fontSize: 12,
              padding: "6px 10px",
            }}
            labelStyle={{ color: "var(--color-ink)", fontWeight: 600 }}
            itemStyle={{ color: "var(--color-ink)" }}
            labelFormatter={label => {
              const s = typeof label === "string" ? label : String(label ?? "");
              return formatIsoDateShort(s, true);
            }}
          />
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 11, color: "var(--color-muted)", paddingTop: 4 }}
            onMouseEnter={(entry) => {
              // Recharts gives us the series config; match by dataKey
              // (not display `name`, since duplicate names can still
              // arrive mid-rename).
              const key = typeof entry?.dataKey === "string" ? entry.dataKey : null;
              if (!key) return;
              const idx = data.findIndex((_, i) => seriesKey(i) === key);
              if (idx >= 0) setHoveredSeries(idx);
            }}
            onMouseLeave={() => setHoveredSeries(null)}
          />
          {data.map((s, i) => {
            const dim = hoveredSeries !== null && hoveredSeries !== i;
            return (
              <Line
                key={i}
                type="monotone"
                dataKey={seriesKey(i)}
                name={s.name}
                stroke={s.color || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]}
                strokeWidth={hoveredSeries === i ? 3 : 2}
                strokeOpacity={dim ? 0.22 : 1}
                dot={false}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Shared helper mirroring `TrendLine`'s formatter — could be extracted
 *  if a third chart needs it. Not yet worth the abstraction. */
function formatIsoDateShort(iso: string, withYear = false): string {
  if (!iso || typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso ?? "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}
