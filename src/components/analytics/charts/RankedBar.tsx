"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

interface Props {
  data: { name: string; count: number }[];
  /** Max bars to render — longer lists are truncated to keep the card scannable. */
  max?: number;
  height?: number;
  /** Optional color override for the top bar (e.g., accent on #1). */
  accent?: string;
  base?: string;
}

/**
 * Horizontal ranked bar — ideal for "top classes" or "top instructors".
 * Sorts descending by `count` and trims to `max`. The #1 bar gets the
 * accent color so it reads as the headline even at a glance.
 */
export default function RankedBar({
  data,
  max = 10,
  height,
  accent = "var(--color-yellow)",
  base = "var(--color-yellow-mid)",
}: Props) {
  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, max);
  // Auto-size so each row has a consistent 28px band.
  const computedHeight = height ?? Math.max(sorted.length * 28, 120);

  if (sorted.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted"
        style={{ height: computedHeight }}
      >
        No data for this period.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: computedHeight }}>
      <ResponsiveContainer>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
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
            width={120}
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
            formatter={(v) => [v as number, "Check-ins"]}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {sorted.map((_, i) => (
              <Cell key={i} fill={i === 0 ? accent : base} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
