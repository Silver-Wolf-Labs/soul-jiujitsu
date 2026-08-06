import { getOverviewAnalytics } from "@/lib/actions/analytics";
import { getGymProfile } from "@/lib/gym-profile";
import PeriodBar from "@/components/analytics/PeriodBar";
import KpiCard from "@/components/analytics/KpiCard";
import NarrativeList from "@/components/analytics/NarrativeList";
import DashboardCard from "@/components/analytics/DashboardCard";
import TrendLine from "@/components/analytics/charts/TrendLine";
import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import { readPeriodFromSearch, formatRangeLabel } from "./_shared";
import type { CsvColumn } from "@/lib/analytics/csv";

// Server components need fresh data every request — the overview shows
// today's pulse, and cached KPIs would be actively misleading when a gym
// owner opens the app after a morning of check-ins.
export const dynamic = "force-dynamic";

interface NeedsAttentionRow {
  memberId: number;
  name: string;
  daysSince: number;
}

export default async function AnalyticsOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { label, start, end } = readPeriodFromSearch(params);
  const [profile, payload] = await Promise.all([
    getGymProfile(),
    getOverviewAnalytics({ label, start, end, compare: true }),
  ]);
  const { period, kpis, trend, needsAttention, narratives, generatedAt } = payload;

  const trendData = trend.map(p => ({
    date: p.date,
    current: p.current,
    previous: p.previous,
  }));

  const needsRows: NeedsAttentionRow[] = needsAttention
    .filter(n => n.type === "at_risk")
    .map(n => ({
      memberId: (n as { memberId: number }).memberId,
      name: (n as { name: string }).name,
      daysSince: (n as { daysSince: number }).daysSince,
    }));

  const needsColumns: CsvColumn<NeedsAttentionRow>[] = [
    { key: "name", label: "Member" },
    { key: "daysSince", label: "Days since last check-in" },
  ];

  return (
    <>
      <PeriodBar
        current={label}
        rangeLabel={formatRangeLabel(period)}
        generatedAt={generatedAt}
      />

      <div data-analytics-content className="px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <header>
          <h1 className="font-display text-3xl text-black">Overview</h1>
          <p className="text-sm text-muted mt-1">
            Gym health at a glance — KPIs, trend, and what needs attention.
          </p>
        </header>

        <NarrativeList items={narratives} />

        {/* KPI strip — 5-up on desktop, 2×3 on tablets, stacked on mobile. */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <KpiCard
            label="Active Members"
            value={kpis.activeMembers}
            hint="Status = active today"
            muted
          />
          <KpiCard label="Check-ins" value={kpis.checkIns} />
          <KpiCard label="New Members" value={kpis.newMembers} />
          <KpiCard label="Net Growth" value={kpis.netGrowth} hint="New − canceled" />
          <KpiCard
            label="At Risk"
            value={kpis.atRisk}
            hint="No check-in for 14+ days"
            invertDirection
            muted
          />
        </div>

        {/* Trend */}
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

        {/* Needs attention */}
        <AnalyticsTable
          title="Needs attention"
          caption="Active members who haven't checked in recently."
          rows={needsRows}
          columns={needsColumns}
          exportSlug="needs-attention"
          exportRange={{
            gymShortName: profile.shortName,
            start: period.start,
            end: period.end,
          }}
          numericKeys={["daysSince"]}
          emptyHint="No at-risk members — everyone's showing up."
        />
      </div>
    </>
  );
}
