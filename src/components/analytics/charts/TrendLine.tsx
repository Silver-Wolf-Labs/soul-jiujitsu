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

interface Series {
  key: string;
  label: string;
  color: string;
  /** Render as a dashed reference line (e.g. previous period overlay). */
  dashed?: boolean;
}

interface Props {
  data: Record<string, string | number | null>[];
  /** The key on each data row holding the X value. Treated as an ISO date
   *  (`YYYY-MM-DD`) and formatted for ticks + tooltip labels. */
  xKey: string;
  series: Series[];
  height?: number;
}

/**
 * Wrapper around Recharts `LineChart` with our own defaults — muted grid,
 * tabular numbers in the tooltip, subdued axes.
 *
 * IMPORTANT: chart formatters live inside this client component. Server
 * Components can't serialize function props across the RSC boundary, so
 * any date/number formatting must happen here — the page passes raw ISO
 * dates + raw numbers, and this component knows how to display them.
 */
export default function TrendLine({
  data,
  xKey,
  series,
  height = 240,
}: Props) {
  // Detect whether the visible window spans more than one calendar year —
  // when it does, ticks include the year ("Dec 18, 2025") so the x-axis
  // is self-describing. Otherwise we stay compact ("Apr 14").
  const yearsInData = new Set<number>();
  for (const row of data) {
    const v = row[xKey];
    if (typeof v === "string" && v.length >= 4) yearsInData.add(Number(v.slice(0, 4)));
  }
  const multiYear = yearsInData.size > 1;
  const tickFmt = (iso: string) => formatIsoDateShort(iso, multiYear);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={tickFmt}
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
            labelFormatter={(label) => {
              const asString = typeof label === "string" ? label : String(label ?? "");
              // Tooltip is where a reader focuses — always include year
              // for unambiguous readout.
              return formatIsoDateShort(asString, true);
            }}
          />
          {series.length > 1 && (
            <Legend
              iconType="plainline"
              wrapperStyle={{ fontSize: 11, color: "var(--color-muted)", paddingTop: 4 }}
            />
          )}
          {series.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              strokeDasharray={s.dashed ? "4 4" : undefined}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * ISO-date → "Mon D" (or "Mon D, YYYY" when `withYear` is true). The
 * backend hands us dates already in gym-local form so no TZ math is
 * needed here. Safe on non-ISO strings — returns them as-is.
 */
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
