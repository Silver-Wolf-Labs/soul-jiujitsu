import { getInstructorsAnalytics } from "@/lib/actions/analytics";
import { getGymProfile } from "@/lib/gym-profile";
import PeriodBar from "@/components/analytics/PeriodBar";
import NarrativeList from "@/components/analytics/NarrativeList";
import DashboardCard from "@/components/analytics/DashboardCard";
import TrendLine from "@/components/analytics/charts/TrendLine";
import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import { readPeriodFromSearch, formatRangeLabel } from "../_shared";
import type { CsvColumn } from "@/lib/analytics/csv";

export const dynamic = "force-dynamic";

interface LeaderRow {
  instructorId: number | null;
  name: string;
  classesTaught: number;
  totalAttendance: number;
  avgAttendance: number;
  uniqueMembers: number;
}

// Rotating palette for the top-3 trend lines. Primary accent stays yellow;
// the rest use neutral ink tones so the chart reads as "our top 3" rather
// than a rainbow. Keep the list short — 3 lines is the sweet spot for
// readability at laptop width.
const TREND_COLORS = ["var(--color-yellow)", "var(--color-ink)", "var(--color-muted)"];

export default async function InstructorsAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { label, start, end } = readPeriodFromSearch(params);
  const [profile, payload] = await Promise.all([
    getGymProfile(),
    getInstructorsAnalytics({ label, start, end }),
  ]);
  const { period, leaderboard, topTrend, narratives, generatedAt } = payload;

  const exportRange = {
    gymShortName: profile.shortName,
    start: period.start,
    end: period.end,
  };

  const leaderColumns: CsvColumn<LeaderRow>[] = [
    { key: "name", label: "Instructor" },
    { key: "classesTaught", label: "Classes taught" },
    { key: "totalAttendance", label: "Total check-ins" },
    { key: "avgAttendance", label: "Avg per class" },
    { key: "uniqueMembers", label: "Unique members" },
  ];

  // Build a single dataset keyed by date, each instructor is its own series.
  // Skip this block when there's nothing to render so the card can show an
  // empty-state message.
  type TrendRow = { date: string } & Record<string, string | number | null>;
  const trendData: TrendRow[] = (() => {
    if (topTrend.length === 0) return [];
    const dates = topTrend[0].points.map(p => p.date);
    return dates.map((d, i) => {
      const row: TrendRow = { date: d };
      for (const series of topTrend) {
        row[`inst_${series.instructorId ?? "null"}`] = series.points[i]?.count ?? 0;
      }
      return row;
    });
  })();

  const trendSeries = topTrend.map((s, i) => ({
    key: `inst_${s.instructorId ?? "null"}`,
    label: s.name,
    color: TREND_COLORS[i % TREND_COLORS.length],
  }));

  const hasData = leaderboard.some(r => r.totalAttendance > 0);

  return (
    <>
      <PeriodBar
        current={label}
        rangeLabel={formatRangeLabel(period)}
        generatedAt={generatedAt}
      />

      <div data-analytics-content className="px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-3xl text-black">Instructors</h1>
            <p className="text-sm text-muted mt-1">
              Who&apos;s teaching, how often, and how full their classes are.
            </p>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted/70 bg-paper border border-line rounded-md px-2.5 py-1.5">
            Attribution is frozen at check-in time using the stable instructor ID.
          </div>
        </header>

        <NarrativeList items={narratives} />

        <DashboardCard
          title="Top 3 instructor trend"
          subtitle="Daily check-ins to the three instructors with the highest totals this period."
        >
          {hasData ? (
            <TrendLine
              data={trendData}
              xKey="date"
              series={trendSeries}
              height={260}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              No instructor-attributed check-ins in this period.
            </div>
          )}
        </DashboardCard>

        <AnalyticsTable<LeaderRow>
          title="Leaderboard"
          caption="Every instructor with activity this period. Manual check-ins land in 'Unassigned'."
          rows={leaderboard}
          columns={leaderColumns}
          exportSlug="instructor-leaderboard"
          exportRange={exportRange}
          numericKeys={["classesTaught", "totalAttendance", "avgAttendance", "uniqueMembers"]}
          emptyHint="No instructor activity yet in this period."
        />
      </div>
    </>
  );
}
