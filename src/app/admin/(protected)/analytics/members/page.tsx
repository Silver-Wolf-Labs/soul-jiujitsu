import Link from "next/link";
import { getMembersAnalytics } from "@/lib/actions/analytics";
import { getGymProfile } from "@/lib/gym-profile";
import PeriodBar from "@/components/analytics/PeriodBar";
import NarrativeList from "@/components/analytics/NarrativeList";
import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import { readPeriodFromSearch, formatRangeLabel, formatShortDate } from "../_shared";
import type { CsvColumn } from "@/lib/analytics/csv";

export const dynamic = "force-dynamic";

interface ConsistentRow {
  memberId: number;
  name: string;
  count: number;
}
interface NewMemberRow {
  memberId: number;
  name: string;
  joinedAt: string;
  checkIns: number;
}
interface AtRiskRow {
  memberId: number;
  name: string;
  daysSince: number;
  lastClassName: string | null;
}

export default async function MembersAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { label, start, end } = readPeriodFromSearch(params);
  const [profile, payload] = await Promise.all([
    getGymProfile(),
    getMembersAnalytics({ label, start, end }),
  ]);
  const { period, mostConsistent, newMembers, atRisk, narratives, generatedAt } = payload;

  const exportRange = {
    gymShortName: profile.shortName,
    start: period.start,
    end: period.end,
  };

  const consistentColumns: CsvColumn<ConsistentRow>[] = [
    { key: "name", label: "Member" },
    { key: "count", label: "Check-ins" },
  ];
  const newColumns: CsvColumn<NewMemberRow>[] = [
    { key: "name", label: "Member" },
    { key: "joinedAt", label: "Joined", format: (v) => formatShortDate(String(v)) },
    { key: "checkIns", label: "Check-ins so far" },
  ];
  const atRiskColumns: CsvColumn<AtRiskRow>[] = [
    { key: "name", label: "Member" },
    { key: "daysSince", label: "Days since last class" },
    {
      key: "lastClassName",
      label: "Last class",
      format: (v) => (v == null ? "—" : String(v)),
    },
  ];

  // Name columns link to the member profile for quick drill-through; export
  // still gets the plain string because `format` isn't used for cells when
  // a `render` prop is provided.
  function renderMemberName<T extends { memberId: number; name: string }>(name: string, row: T) {
    return (
      <Link
        href={`/admin/members/${row.memberId}`}
        className="text-ink hover:text-black underline underline-offset-2 decoration-line hover:decoration-ink"
      >
        {name}
      </Link>
    );
  }

  return (
    <>
      <PeriodBar
        current={label}
        rangeLabel={formatRangeLabel(period)}
        generatedAt={generatedAt}
      />

      <div data-analytics-content className="px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <header>
          <h1 className="font-display text-3xl text-black">Members</h1>
          <p className="text-sm text-muted mt-1">
            Consistency leaders, fresh faces, and members drifting away.
          </p>
        </header>

        <NarrativeList items={narratives} />

        <AnalyticsTable<ConsistentRow>
          title="Most consistent this period"
          caption="Top members by check-in count."
          rows={mostConsistent}
          columns={consistentColumns}
          exportSlug="most-consistent-members"
          exportRange={exportRange}
          numericKeys={["count"]}
          emptyHint="No check-ins yet this period."
          render={(col, row) =>
            col.key === "name" ? renderMemberName(row.name, row) : undefined
          }
        />

        <AnalyticsTable<AtRiskRow>
          title="At-risk members"
          caption="Active members with no check-in in 14+ days."
          rows={atRisk}
          columns={atRiskColumns}
          exportSlug="at-risk-members"
          exportRange={exportRange}
          numericKeys={["daysSince"]}
          emptyHint="No at-risk members — everyone's showing up."
          render={(col, row) => {
            if (col.key === "name") return renderMemberName(row.name, row);
            if (col.key === "lastClassName") return row.lastClassName ?? "—";
            return undefined;
          }}
        />

        <AnalyticsTable<NewMemberRow>
          title="New members this period"
          caption="Joined during this window, sorted newest first."
          rows={newMembers}
          columns={newColumns}
          exportSlug="new-members"
          exportRange={exportRange}
          numericKeys={["checkIns"]}
          emptyHint="No new members in this period."
          render={(col, row) => {
            if (col.key === "name") return renderMemberName(row.name, row);
            if (col.key === "joinedAt") return formatShortDate(row.joinedAt);
            return undefined;
          }}
        />
      </div>
    </>
  );
}
