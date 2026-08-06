import { getAttendanceAnalytics } from "@/lib/actions/analytics";
import { getGymProfile } from "@/lib/gym-profile";
import {
  listModalities,
  listLevels,
  listAudiences,
} from "@/lib/actions/class-taxonomy";
import PeriodBar from "@/components/analytics/PeriodBar";
import KpiCard from "@/components/analytics/KpiCard";
import NarrativeList from "@/components/analytics/NarrativeList";
import DashboardCard from "@/components/analytics/DashboardCard";
import TrendLine from "@/components/analytics/charts/TrendLine";
import StackedClassBar from "@/components/analytics/charts/StackedClassBar";
import ModalityTrendLine from "@/components/analytics/charts/ModalityTrendLine";
import Heatmap from "@/components/analytics/charts/Heatmap";
import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import AttendanceColorByToggle from "./AttendanceColorByToggle";
import { readPeriodFromSearch, formatRangeLabel } from "../_shared";
import type { CsvColumn } from "@/lib/analytics/csv";
import type { AudienceKind } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface ClassRow {
  name: string;
  count: number;
}

/**
 * Parse WS5 dimension-filter params from the URL. Shape matches the
 * contract PeriodBar writes:
 *  - `?modality=gi,no-gi`  → multi-select slug array
 *  - `?level=advanced`     → single slug
 *  - `?audience=women-only,age-40-plus` → multi-select slug array
 *  - `?colorBy=modality`   → stacked-bar color mode toggle
 */
function readFilterParams(
  params: Record<string, string | string[] | undefined> | undefined,
): {
  modalitySlugs: string[];
  levelSlug: string | null;
  audienceSlugs: string[];
  colorBy: "weekday" | "modality";
} {
  function firstStr(v: string | string[] | undefined): string | null {
    const raw = Array.isArray(v) ? v[0] : v;
    return raw ? raw : null;
  }
  function csv(v: string | string[] | undefined): string[] {
    const raw = firstStr(v);
    if (!raw) return [];
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }
  const color = firstStr(params?.colorBy);
  return {
    modalitySlugs: csv(params?.modality),
    levelSlug: firstStr(params?.level),
    audienceSlugs: csv(params?.audience),
    colorBy: color === "modality" ? "modality" : "weekday",
  };
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { label, start, end } = readPeriodFromSearch(params);
  const { modalitySlugs, levelSlug, audienceSlugs, colorBy } = readFilterParams(params);

  const [profile, payload, modalities, levels, audiences] = await Promise.all([
    getGymProfile(),
    getAttendanceAnalytics({
      label,
      start,
      end,
      compare: true,
      modalitySlugs,
      levelSlug,
      audienceSlugs,
    }),
    listModalities(),
    listLevels(),
    listAudiences(),
  ]);
  const {
    period,
    kpis,
    trend,
    topClasses,
    classByWeekday,
    heatmap,
    modalityBreakdown,
    levelBreakdown,
    audienceBreakdown,
    modalityTrend,
    narratives,
    generatedAt,
  } = payload;

  const trendData = trend.map(p => ({
    date: p.date,
    current: p.current,
    previous: p.previous,
  }));

  const classColumns: CsvColumn<ClassRow>[] = [
    { key: "name", label: "Class" },
    { key: "count", label: "Check-ins" },
  ];

  const exportRange = {
    gymShortName: profile.shortName,
    start: period.start,
    end: period.end,
  };

  // Map from modality display-name → live color, used by StackedClassBar
  // when `colorBy="modality"`. Server resolves this so the client doesn't
  // need to refetch `class_modalities`.
  const modalityColorMap: Record<string, string | null> = {};
  for (const m of modalityBreakdown) modalityColorMap[m.name] = m.color;

  // Group the audience breakdown by kind so the donut/summary row renders
  // neatly. "Unknown" catches any null `kind` snapshots (shouldn't happen
  // post-WS4, but tolerated).
  const audienceByKind: Record<AudienceKind | "unknown", typeof audienceBreakdown> = {
    age: [],
    gender: [],
    rank: [],
    access: [],
    unknown: [],
  };
  for (const a of audienceBreakdown) {
    const bucket = a.kind ?? "unknown";
    audienceByKind[bucket].push(a);
  }

  return (
    <>
      <PeriodBar
        current={label}
        rangeLabel={formatRangeLabel(period)}
        generatedAt={generatedAt}
        filters={{
          modalities: modalities.map(m => ({ slug: m.slug, name: m.name })),
          levels: levels.map(l => ({ slug: l.slug, name: l.name })),
          audiences: audiences.map(a => ({ slug: a.slug, name: a.name, kind: a.kind })),
        }}
      />

      <div data-analytics-content className="px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <header>
          <h1 className="font-display text-3xl text-black">Attendance</h1>
          <p className="text-sm text-muted mt-1">
            Schedule demand, class popularity, and weekly rhythm.
          </p>
        </header>

        <NarrativeList items={narratives} />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="Total check-ins" value={kpis.totalCheckIns} />
          <KpiCard label="Unique attendees" value={kpis.uniqueMembers} />
          <KpiCard
            label="Avg per class"
            value={kpis.avgPerClass}
            hint="Check-ins ÷ distinct sessions"
            muted
          />
        </div>

        <DashboardCard
          title="Daily check-ins"
          subtitle={
            payload.compare
              ? "Current period vs previous period (dashed)."
              : "Current period."
          }
        >
          <TrendLine
            data={trendData}
            xKey="date"
            series={[
              { key: "current", label: "Current", color: "var(--color-yellow)" },
              ...(payload.compare
                ? [
                    {
                      key: "previous",
                      label: "Previous",
                      color: "var(--color-muted)",
                      dashed: true,
                    },
                  ]
                : []),
            ]}
          />
        </DashboardCard>

        <DashboardCard
          title="Modality trend"
          subtitle={`Daily check-ins, one line per modality (top ${modalityTrend.length} by total).`}
        >
          <ModalityTrendLine data={modalityTrend} />
        </DashboardCard>

        <DashboardCard
          title="Top classes"
          subtitle={
            colorBy === "weekday"
              ? "Stacked by weekday — reveals what day drives each class."
              : "Colored by modality — each bar's color matches its core activity."
          }
          action={<AttendanceColorByToggle current={colorBy} />}
        >
          <StackedClassBar
            data={classByWeekday}
            max={10}
            colorBy={colorBy}
            modalityColors={modalityColorMap}
          />
        </DashboardCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DashboardCard
            title="Under-performing classes"
            subtitle="Bottom of the ranking, same stacked view so soft days are visible."
          >
            <StackedClassBar
              data={classByWeekday}
              max={5}
              reverse
              colorBy={colorBy}
              modalityColors={modalityColorMap}
            />
          </DashboardCard>

          <DashboardCard
            title="Weekday × hour heatmap"
            subtitle="Where attendance concentrates on the schedule."
          >
            <Heatmap data={heatmap} />
          </DashboardCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <DashboardCard
            title="By modality"
            subtitle="Check-ins grouped by the class's core activity."
          >
            <DimensionList rows={modalityBreakdown.map(m => ({
              key: `${m.modalityId ?? "null"}`,
              name: m.name,
              count: m.count,
              swatch: m.color,
            }))} />
          </DashboardCard>

          <DashboardCard
            title="By level"
            subtitle="Fundamentals vs Advanced mix, including unspecified."
          >
            <DimensionList rows={levelBreakdown.map(l => ({
              key: `${l.levelId ?? "null"}`,
              name: l.name,
              count: l.count,
            }))} />
          </DashboardCard>

          <DashboardCard
            title="By audience"
            subtitle="Grouped by kind. One check-in can credit multiple audiences."
          >
            <AudienceBreakdownBlock byKind={audienceByKind} />
          </DashboardCard>
        </div>

        <AnalyticsTable
          title="Class popularity"
          caption="Every class ranked — export for spreadsheet workflows. The stacked bars above show weekday or modality distribution."
          rows={topClasses}
          columns={classColumns}
          exportSlug="class-popularity"
          exportRange={exportRange}
          numericKeys={["count"]}
          emptyHint="No check-ins in this period."
        />
      </div>
    </>
  );
}

/**
 * Compact ranked list used by the three dimension-breakdown cards.
 * A full chart would over-index for a 3-to-8-item list; a numeric bar
 * behind each row gives the same "which is biggest?" read at a fraction
 * of the visual weight.
 */
function DimensionList({
  rows,
}: {
  rows: { key: string; name: string; count: number; swatch?: string | null }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No data in this period.</p>;
  }
  const max = Math.max(...rows.map(r => r.count));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map(r => {
        const pct = max === 0 ? 0 : Math.round((r.count / max) * 100);
        return (
          <li key={r.key} className="text-sm">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="flex items-center gap-1.5 text-ink truncate">
                {r.swatch ? (
                  <span
                    aria-hidden="true"
                    className="inline-block w-2.5 h-2.5 rounded-sm border border-line/40"
                    style={{ background: r.swatch }}
                  />
                ) : null}
                <span className="truncate">{r.name}</span>
              </span>
              <span className="text-muted tabular-nums flex-shrink-0">{r.count}</span>
            </div>
            <div className="h-1.5 rounded bg-paper overflow-hidden">
              <div
                className="h-full bg-yellow"
                style={{ width: `${pct}%`, background: r.swatch || "var(--color-yellow)" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Audience card — split by kind so "Age 40+" and "Black Belts Only"
 * read as distinct concepts rather than one flat list. Each kind-group
 * renders its own DimensionList.
 */
function AudienceBreakdownBlock({
  byKind,
}: {
  byKind: Record<AudienceKind | "unknown", { audienceId: number | null; name: string; kind: AudienceKind | null; count: number }[]>;
}) {
  const sections: { kind: AudienceKind | "unknown"; title: string }[] = [
    { kind: "age", title: "Age" },
    { kind: "gender", title: "Gender" },
    { kind: "rank", title: "Rank" },
    { kind: "access", title: "Access" },
    { kind: "unknown", title: "Unknown" },
  ];
  const total = sections.reduce((s, g) => s + byKind[g.kind].length, 0);
  if (total === 0) {
    return <p className="text-sm text-muted">No audience attribution in this period.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {sections
        .filter(g => byKind[g.kind].length > 0)
        .map(g => (
          <div key={g.kind}>
            <div className="font-mono uppercase tracking-wider text-[10px] text-muted mb-1">
              {g.title}
            </div>
            <DimensionList
              rows={byKind[g.kind].map(a => ({
                key: `${a.audienceId ?? "null"}::${a.name}`,
                name: a.name,
                count: a.count,
              }))}
            />
          </div>
        ))}
    </div>
  );
}
