"use client";

interface Cell {
  day: number;  // 1=Mon..7=Sun
  hour: number; // 0..23
  count: number;
}

interface Props {
  data: Cell[];
  /** Hour range rendered — defaults to 6 AM–10 PM so empty overnight rows don't pad the grid. */
  minHour?: number;
  maxHour?: number;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatHour(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "a" : "p"}`;
}

/**
 * Day × hour attendance heatmap. Hand-rolled (not Recharts) because the
 * grid is simple enough that a pure CSS render is faster, smaller, and
 * more accessible than shoe-horning it into a chart lib.
 *
 * Color scale: paper → yellow-mid → yellow. Cells with 0 stay neutral so
 * the eye groups activity rather than reading absence as a data point.
 */
export default function Heatmap({ data, minHour = 6, maxHour = 22 }: Props) {
  const hours: number[] = [];
  for (let h = minHour; h <= maxHour; h++) hours.push(h);

  const grid = new Map<string, number>();
  let max = 0;
  for (const c of data) {
    if (c.hour < minHour || c.hour > maxHour) continue;
    const key = `${c.day}-${c.hour}`;
    grid.set(key, c.count);
    if (c.count > max) max = c.count;
  }

  if (max === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-muted">
        No attendance in this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="w-10" aria-hidden />
            {hours.map(h => (
              <th
                key={h}
                className="text-[10px] font-mono text-muted font-normal w-7 text-center"
                scope="col"
              >
                {formatHour(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((label, idx) => {
            const day = idx + 1;
            return (
              <tr key={day}>
                <th
                  scope="row"
                  className="pr-2 text-[11px] text-muted font-medium text-right align-middle"
                >
                  {label}
                </th>
                {hours.map(h => {
                  const count = grid.get(`${day}-${h}`) ?? 0;
                  // 5 discrete steps so the eye can quickly rank cells —
                  // continuous alpha blends into an unreadable wash.
                  const step = count === 0 ? 0 : Math.ceil((count / max) * 4);
                  const bg =
                    step === 0
                      ? "var(--color-paper)"
                      : step === 1
                        ? "color-mix(in srgb, var(--color-yellow) 25%, white)"
                        : step === 2
                          ? "color-mix(in srgb, var(--color-yellow) 50%, white)"
                          : step === 3
                            ? "color-mix(in srgb, var(--color-yellow) 75%, white)"
                            : "var(--color-yellow)";
                  return (
                    <td
                      key={h}
                      className="w-7 h-7 rounded-sm"
                      style={{ backgroundColor: bg }}
                      title={`${label} ${formatHour(h)} — ${count} check-in${count === 1 ? "" : "s"}`}
                      aria-label={`${label} ${formatHour(h)}: ${count} check-ins`}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-muted font-mono">
        <span>less</span>
        <span className="w-4 h-3 rounded-sm" style={{ background: "var(--color-paper)" }} />
        <span className="w-4 h-3 rounded-sm" style={{ background: "color-mix(in srgb, var(--color-yellow) 25%, white)" }} />
        <span className="w-4 h-3 rounded-sm" style={{ background: "color-mix(in srgb, var(--color-yellow) 50%, white)" }} />
        <span className="w-4 h-3 rounded-sm" style={{ background: "color-mix(in srgb, var(--color-yellow) 75%, white)" }} />
        <span className="w-4 h-3 rounded-sm" style={{ background: "var(--color-yellow)" }} />
        <span>more</span>
      </div>
    </div>
  );
}
