"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { useState } from "react";
import type { ClassByWeekday } from "@/lib/analytics/metrics";

/**
 * Render mode for the stacked bars:
 *  - `"weekday"` (default) — seven stacked segments per bar, one per
 *    day-of-week. Reveals "which day drives this class".
 *  - `"modality"` — single-segment bars colored by the class's modality
 *    snapshot. Each bar reads as "this class is a Gi class". Same
 *    totals; different framing of the same data.
 */
export type StackedClassBarColorBy = "weekday" | "modality";

interface Props {
  data: ClassByWeekday[];
  /** Max bars rendered — keeps the card scannable on a tablet. */
  max?: number;
  /** Render from the bottom of the ranking (low → high total) for the
   *  "underperforming classes" card. Default shows top-down. */
  reverse?: boolean;
  height?: number;
  /** Render mode — see `StackedClassBarColorBy`. Defaults to `"weekday"`
   *  to preserve the existing behavior. */
  colorBy?: StackedClassBarColorBy;
  /** Only used when `colorBy="modality"`. Map from modality display
   *  name → hex color (`class_modalities.color`). Payload provides this
   *  alongside `modalityBreakdown`. Missing names fall back to a
   *  neutral palette. */
  modalityColors?: Record<string, string | null>;
}

// Day-of-week palette. Weekdays lean cool, weekend leans warm so an
// owner spots "most attendance is Sat morning" at a glance. Tuned for
// readability next to our yellow/blue theme tokens.
const WEEKDAY_SERIES: { key: keyof ClassByWeekday; label: string; color: string }[] = [
  { key: "mon", label: "Mon", color: "#60A5FA" }, // blue
  { key: "tue", label: "Tue", color: "#818CF8" }, // indigo
  { key: "wed", label: "Wed", color: "#A78BFA" }, // violet
  { key: "thu", label: "Thu", color: "#F59E0B" }, // amber
  { key: "fri", label: "Fri", color: "#F97316" }, // orange
  { key: "sat", label: "Sat", color: "#10B981" }, // emerald
  { key: "sun", label: "Sun", color: "#64748B" }, // slate
];

// Fallback palette when a modality row has no `color` set — rotates
// per-modality-name so each slot stays stable within a single render.
const MODALITY_FALLBACK = ["#0EA5E9", "#F59E0B", "#10B981", "#A855F7", "#EF4444", "#64748B"];

/**
 * Horizontal stacked bar — one bar per class, stacked by the day of
 * week each check-in landed on. Reveals both "how popular" and "which
 * day drives it" in a single read.
 */
export default function StackedClassBar({
  data,
  max = 10,
  reverse = false,
  height,
  colorBy = "weekday",
  modalityColors,
}: Props) {
  // Legend-hover highlight — weekday mode dims non-hovered stack series;
  // modality mode dims bars whose modality label isn't hovered. Key is
  // the series dataKey (weekday) or modality name (modality mode).
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const sorted = [...data]
    .sort((a, b) => (reverse ? a.total - b.total : b.total - a.total))
    .slice(0, max);
  const computedHeight = height ?? Math.max(sorted.length * 36, 160);

  if (sorted.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted"
        style={{ height: computedHeight }}
      >
        No check-ins in this period.
      </div>
    );
  }

  // Build the modality palette at the render level so the legend and
  // the bar cells stay in lockstep.
  const modalityPalette = new Map<string, string>();
  if (colorBy === "modality") {
    const uniqueNames = Array.from(
      new Set(sorted.map(r => r.modalityName ?? "Unspecified")),
    );
    uniqueNames.forEach((name, i) => {
      const fromOwner = modalityColors?.[name] ?? null;
      modalityPalette.set(
        name,
        fromOwner || MODALITY_FALLBACK[i % MODALITY_FALLBACK.length],
      );
    });
  }

  const modalityLegend =
    colorBy === "modality" ? (
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted mt-2">
        {Array.from(modalityPalette.entries()).map(([name, color]) => {
          const isHovered = hoveredKey === name;
          const dim = hoveredKey !== null && !isHovered;
          return (
            <li
              key={name}
              className={`inline-flex items-center gap-1.5 cursor-default transition-opacity ${dim ? "opacity-40" : ""}`}
              onMouseEnter={() => setHoveredKey(name)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: color }}
              />
              <span className={isHovered ? "text-ink font-medium" : ""}>{name}</span>
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div style={{ width: "100%", height: computedHeight }}>
      <ResponsiveContainer>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 24, left: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "var(--color-muted)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: "var(--color-ink)" }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip
            contentStyle={{
              background: "white",
              border: "1px solid var(--color-line)",
              borderRadius: 6,
              fontSize: 12,
              padding: "6px 10px",
            }}
            cursor={{ fill: "var(--color-paper)" }}
            // Hide 0-value entries so the tooltip doesn't list days the
            // class never runs. (Only applies in weekday mode; in
            // modality mode there's only one series per bar.)
            formatter={(v, name) =>
              (typeof v === "number" && v > 0) ? [v, name] : null as unknown as [number, string]
            }
          />
          {/* Weekday mode uses Recharts' built-in legend driven by the
              seven `<Bar>` children. Modality mode's legend is a static
              swatch list keyed on the palette — rendered below the
              chart (see `modalityLegend` JSX at the end of this return
              block) rather than as a Recharts <Legend /> child because
              Recharts' typed `Legend.payload` prop is omitted from its
              public TS surface in this version. */}
          {colorBy === "weekday" ? (
            <Legend
              wrapperStyle={{ fontSize: 11, color: "var(--color-muted)", paddingTop: 6 }}
              iconType="square"
              onMouseEnter={(entry) => {
                const key = typeof entry?.dataKey === "string" ? entry.dataKey : null;
                if (key) setHoveredKey(key);
              }}
              onMouseLeave={() => setHoveredKey(null)}
            />
          ) : null}
          {colorBy === "weekday"
            ? WEEKDAY_SERIES.map(s => {
                const dim = hoveredKey !== null && hoveredKey !== s.key;
                return (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="class"
                    fill={s.color}
                    fillOpacity={dim ? 0.2 : 1}
                    isAnimationActive={false}
                  />
                );
              })
            : (
              // Modality mode: single series on `total`, per-cell fill
              // resolved from the palette. Legend is synthesized above —
              // hovered modality dims the non-matching cells.
              <Bar
                key="total-modality"
                dataKey="total"
                name="Check-ins"
                fill="#64748B"
                isAnimationActive={false}
              >
                {sorted.map((row, i) => {
                  const key = row.modalityName ?? "Unspecified";
                  const color = modalityPalette.get(key) ?? "#64748B";
                  const dim = hoveredKey !== null && hoveredKey !== key;
                  return <Cell key={i} fill={color} fillOpacity={dim ? 0.2 : 1} />;
                })}
              </Bar>
            )}
        </BarChart>
      </ResponsiveContainer>
      {modalityLegend}
    </div>
  );
}
