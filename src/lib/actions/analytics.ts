"use server";

/**
 * Analytics server actions — one entry point per dashboard.
 *
 * Each action:
 *   1. Gates on admin role via `requireAdmin()`.
 *   2. Normalizes the requested period into the gym TZ.
 *   3. Composes metrics from `lib/analytics/metrics.ts` (single source of
 *      truth for every number the UI shows).
 *   4. Assembles a versioned, typed payload.
 *   5. Emits a lightweight slow-query log line so the team can see the
 *      tail latency in prod logs without any dashboard wiring.
 *
 * Live queries only in v1. Materialized views / cron rollups are a
 * Phase 1b concern and only added when p95 exceeds the query-cost
 * budget (500 ms). Don't pre-optimize.
 */

import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/require-admin";
import {
  buildPeriod,
  previousPeriod,
  computeDelta,
  alignToCurrent,
} from "@/lib/analytics/period";
import {
  countActiveMembers,
  countNewMembers,
  countCanceledMembers,
  countCheckIns,
  countUniqueAttendees,
  dailyCheckIns,
  classPopularity,
  classPopularityByWeekday,
  weekdayHourHeatmap,
  mostConsistentMembers,
  atRiskMembers,
  newMembersWithActivity,
  instructorLeaderboard,
  instructorDailyTrend,
  countByModality,
  countByLevel,
  countByAudience,
  modalityDailyTrend,
  type AttendanceFilters,
} from "@/lib/analytics/metrics";
import {
  buildOverviewNarratives,
  buildAttendanceNarratives,
  buildMembersNarratives,
  buildInstructorsNarratives,
} from "@/lib/analytics/narratives";
import type {
  AnalyticsParams,
  AttendancePayload,
  AttendanceFiltersEcho,
  InstructorsPayload,
  MembersPayload,
  OverviewPayload,
  TrendPoint,
} from "@/lib/analytics/types";

const AT_RISK_DAYS = 14;
const QUERY_BUDGET_MS = 500;

/**
 * Analytics payloads are cached for 15 minutes per unique param set.
 * Admins viewing the same dashboard repeatedly (or bouncing between
 * dashboards that share the same period) reuse the cached payload.
 * Mutations that should invalidate can `revalidateTag("analytics")` —
 * today nothing does, the 15-min TTL is short enough for staleness to
 * self-correct without fragile bust logic.
 *
 * Cache key includes all `AnalyticsParams` fields (serialized as JSON
 * by `unstable_cache`), so different periods / filter sets get their
 * own cache entries without collisions.
 */
const ANALYTICS_CACHE_SECONDS = 15 * 60;

/** Number of modality series returned in `AttendancePayload.modalityTrend`.
 *  Chart legibility is the real constraint here — beyond ~5 series,
 *  line overlap makes the chart noise instead of signal. */
const MODALITY_TREND_TOP_N = 5;

/**
 * Resolve URL-param slugs to dimension ids via a single round-trip per
 * dimension. Unknown slugs are silently dropped so a stale URL doesn't
 * 500 the page — the echoed `filters` shape surfaces the actually-applied
 * slugs so the UI can correct the URL on the next interaction.
 *
 * Keeps the query cheap: three `select id,slug where slug in (...)` hits
 * against small tables (< 50 rows each in practice).
 */
async function resolveAttendanceFilters(
  svc: ReturnType<typeof createServiceClient>,
  params: AnalyticsParams,
): Promise<{ filters: AttendanceFilters; echo: AttendanceFiltersEcho }> {
  const modalitySlugs = (params.modalitySlugs ?? []).filter(s => !!s);
  const levelSlug = params.levelSlug ?? null;
  const audienceSlugs = (params.audienceSlugs ?? []).filter(s => !!s);

  const [modalityRows, levelRow, audienceRows] = await Promise.all([
    modalitySlugs.length === 0
      ? Promise.resolve({ data: [] as { id: number; slug: string }[] })
      : svc.from("class_modalities").select("id, slug").in("slug", modalitySlugs),
    levelSlug
      ? svc.from("class_levels").select("id, slug").eq("slug", levelSlug).maybeSingle()
      : Promise.resolve({ data: null as { id: number; slug: string } | null }),
    audienceSlugs.length === 0
      ? Promise.resolve({ data: [] as { id: number; slug: string }[] })
      : svc.from("class_audiences").select("id, slug").in("slug", audienceSlugs),
  ]);

  const modalityRowsTyped = (modalityRows.data ?? []) as { id: number; slug: string }[];
  const audienceRowsTyped = (audienceRows.data ?? []) as { id: number; slug: string }[];
  const levelRowTyped = (levelRow.data ?? null) as { id: number; slug: string } | null;

  const filters: AttendanceFilters = {
    modalityIds: modalityRowsTyped.map(r => r.id),
    levelId: levelRowTyped ? levelRowTyped.id : null,
    audienceIds: audienceRowsTyped.map(r => r.id),
  };
  const echo: AttendanceFiltersEcho = {
    modality: {
      ids: modalityRowsTyped.map(r => r.id),
      slugs: modalityRowsTyped.map(r => r.slug),
    },
    level: {
      id: levelRowTyped ? levelRowTyped.id : null,
      slug: levelRowTyped ? levelRowTyped.slug : null,
    },
    audience: {
      ids: audienceRowsTyped.map(r => r.id),
      slugs: audienceRowsTyped.map(r => r.slug),
    },
  };
  return { filters, echo };
}

function logQuery(name: string, ms: number, ctx: Record<string, unknown>): void {
  const rounded = Math.round(ms);
  if (rounded > 2000) {
    console.error(`[analytics] ${name} SLOW ${rounded}ms`, ctx);
  } else if (rounded > QUERY_BUDGET_MS) {
    console.warn(`[analytics] ${name} ${rounded}ms (over ${QUERY_BUDGET_MS}ms budget)`, ctx);
  } else if (process.env.NODE_ENV !== "production") {
    console.info(`[analytics] ${name} ${rounded}ms`, ctx);
  }
}

// ─── Overview ───────────────────────────────────────────────────────────────

export async function getOverviewAnalytics(params: AnalyticsParams = {}): Promise<OverviewPayload> {
  await requireAdmin();
  return overviewAnalyticsCached(params);
}

const overviewAnalyticsCached = unstable_cache(
  async (params: AnalyticsParams): Promise<OverviewPayload> => {
  const t0 = performance.now();
  const period = await buildPeriod(params);
  const compare = (params.compare ?? true) ? previousPeriod(period) : null;
  const svc = createServiceClient();

  const [
    activeNow,
    checkInsNow, checkInsPrev,
    newNow, newPrev,
    canceledNow, canceledPrev,
    trendNow, trendPrev,
    atRiskList,
  ] = await Promise.all([
    countActiveMembers(svc),
    countCheckIns(svc, period),
    compare ? countCheckIns(svc, compare) : Promise.resolve(0),
    countNewMembers(svc, period),
    compare ? countNewMembers(svc, compare) : Promise.resolve(0),
    countCanceledMembers(svc, period),
    compare ? countCanceledMembers(svc, compare) : Promise.resolve(0),
    dailyCheckIns(svc, period),
    compare ? dailyCheckIns(svc, compare) : Promise.resolve([]),
    atRiskMembers(svc, AT_RISK_DAYS, 5),
  ]);

  const netGrowthNow = newNow - canceledNow;
  const netGrowthPrev = newPrev - canceledPrev;

  const kpis = {
    activeMembers: computeDelta(activeNow, null),
    checkIns: computeDelta(checkInsNow, compare ? checkInsPrev : null),
    newMembers: computeDelta(newNow, compare ? newPrev : null),
    netGrowth: computeDelta(netGrowthNow, compare ? netGrowthPrev : null),
    atRisk: computeDelta(atRiskList.length, null),
  };

  // Zip current & previous trends on the current-period date axis.
  const prevByAlignedDate = new Map<string, number>();
  for (const p of trendPrev) {
    const aligned = compare ? alignToCurrent(p.date, compare, period) : null;
    if (aligned) prevByAlignedDate.set(aligned, p.count);
  }
  const trend: TrendPoint[] = trendNow.map(p => ({
    date: p.date,
    current: p.count,
    previous: prevByAlignedDate.get(p.date) ?? null,
  }));

  // Needs Attention — just at-risk for now; underperforming classes is a
  // heuristic we can add once we have enough history to set a meaningful
  // threshold (intentionally deferred to keep v1 honest).
  const needsAttention = atRiskList.map(m => ({
    type: "at_risk" as const,
    memberId: m.memberId,
    name: m.name,
    daysSince: m.daysSince,
  }));

  const narratives = buildOverviewNarratives({
    periodLabel: period.label,
    checkIns: kpis.checkIns,
    atRisk: kpis.atRisk,
    netGrowth: kpis.netGrowth,
  });

  const payload: OverviewPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    period,
    compare,
    kpis,
    trend,
    needsAttention,
    narratives,
  };

  logQuery("overview", performance.now() - t0, { period: period.label });
  return payload;
  },
  ["overview-analytics"],
  { revalidate: ANALYTICS_CACHE_SECONDS, tags: ["analytics", "overview-analytics"] },
);

// ─── Attendance ─────────────────────────────────────────────────────────────

export async function getAttendanceAnalytics(params: AnalyticsParams = {}): Promise<AttendancePayload> {
  await requireAdmin();
  return attendanceAnalyticsCached(params);
}

const attendanceAnalyticsCached = unstable_cache(
  async (params: AnalyticsParams): Promise<AttendancePayload> => {
  const t0 = performance.now();
  const period = await buildPeriod(params);
  const compare = (params.compare ?? true) ? previousPeriod(period) : null;
  const svc = createServiceClient();

  // Resolve URL-param filter slugs → ids. We resolve once and pass the
  // resulting `filters` into every metric + the delta query so the
  // whole payload is self-consistent.
  const { filters, echo } = await resolveAttendanceFilters(svc, params);

  const [
    checkInsNow, checkInsPrev,
    uniqueNow, uniquePrev,
    trendNow, trendPrev,
    classes,
    classByWeekday,
    heatmap,
    modalityCounts,
    levelCounts,
    audienceCounts,
  ] = await Promise.all([
    countCheckIns(svc, period, filters),
    compare ? countCheckIns(svc, compare, filters) : Promise.resolve(0),
    countUniqueAttendees(svc, period, filters),
    compare ? countUniqueAttendees(svc, compare, filters) : Promise.resolve(0),
    dailyCheckIns(svc, period, filters),
    compare ? dailyCheckIns(svc, compare, filters) : Promise.resolve([]),
    classPopularity(svc, period, filters),
    classPopularityByWeekday(svc, period, filters),
    weekdayHourHeatmap(svc, period, filters),
    countByModality(svc, period, filters),
    countByLevel(svc, period, filters),
    countByAudience(svc, period, filters),
  ]);

  const prevByAlignedDate = new Map<string, number>();
  for (const p of trendPrev) {
    const aligned = compare ? alignToCurrent(p.date, compare, period) : null;
    if (aligned) prevByAlignedDate.set(aligned, p.count);
  }
  const trend: TrendPoint[] = trendNow.map(p => ({
    date: p.date,
    current: p.count,
    previous: prevByAlignedDate.get(p.date) ?? null,
  }));

  // avgPerClass: total / (number of distinct (slot_id, class_date) pairs).
  // Delta not meaningful in v1 — hide it. Apply the same filter predicate
  // to the denominator query so the KPI matches the filtered total.
  let sessionQuery = svc
    .from("check_ins")
    .select("schedule_slot_id, class_date, id")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  if (filters.modalityIds && filters.modalityIds.length > 0) {
    sessionQuery = sessionQuery.in("modality_id", filters.modalityIds);
  }
  if (filters.levelId !== null && filters.levelId !== undefined) {
    sessionQuery = sessionQuery.eq("level_id", filters.levelId);
  }
  if (filters.audienceIds && filters.audienceIds.length > 0) {
    const { data: aud } = await svc
      .from("check_in_audiences")
      .select("check_in_id")
      .in("audience_id", filters.audienceIds);
    const ids = Array.from(
      new Set((aud ?? []).map(r => (r as { check_in_id: number }).check_in_id)),
    );
    if (ids.length === 0) {
      sessionQuery = sessionQuery.eq("id", -1); // short-circuit to empty set
    } else {
      sessionQuery = sessionQuery.in("id", ids);
    }
  }
  const { data: sessionRows } = await sessionQuery;
  const distinctSessions = new Set<string>();
  for (const r of sessionRows ?? []) {
    const row = r as { schedule_slot_id: number | null; class_date: string };
    distinctSessions.add(`${row.schedule_slot_id ?? "manual"}::${row.class_date}`);
  }
  const avgPerClassNow = distinctSessions.size === 0
    ? 0
    : +(checkInsNow / distinctSessions.size).toFixed(1);

  const topClasses = classes.slice(0, 10);
  const bottomClasses = [...classes].reverse().slice(0, 10);

  // Peak slot for narrative — pick the maximum heatmap cell.
  const peakSlot = heatmap.length === 0
    ? null
    : heatmap.reduce((a, b) => (b.count > a.count ? b : a));
  const peakSlotAvgCount =
    heatmap.length === 0 ? 0 : heatmap.reduce((s, r) => s + r.count, 0) / heatmap.length;

  const kpis = {
    totalCheckIns: computeDelta(checkInsNow, compare ? checkInsPrev : null),
    uniqueMembers: computeDelta(uniqueNow, compare ? uniquePrev : null),
    avgPerClass: computeDelta(avgPerClassNow, null),
  };

  // ── Modality breakdown + trend ───────────────────────────────────────────
  // Decorate the modality breakdown with the owner-configured `color`
  // column so StackedClassBar / ModalityTrendLine can use the palette
  // without a second client-side fetch.
  const modalityIdsNeedingColor = modalityCounts
    .map(m => m.modalityId)
    .filter((id): id is number => id !== null);
  const colorByModalityId = new Map<number, string | null>();
  if (modalityIdsNeedingColor.length > 0) {
    const { data: colorRows } = await svc
      .from("class_modalities")
      .select("id, color")
      .in("id", modalityIdsNeedingColor);
    for (const raw of colorRows ?? []) {
      const row = raw as { id: number; color: string | null };
      colorByModalityId.set(row.id, row.color);
    }
  }
  const modalityBreakdown = modalityCounts.map(m => ({
    modalityId: m.modalityId,
    name: m.name,
    color: m.modalityId !== null ? colorByModalityId.get(m.modalityId) ?? null : null,
    count: m.count,
  }));

  // Modality trend: top-N by total count, zero-filled across the period.
  const topModalities = modalityBreakdown.slice(0, MODALITY_TREND_TOP_N);
  const trendMap = await modalityDailyTrend(
    svc,
    period,
    topModalities.map(m => m.modalityId),
    filters,
  );
  const dates = trendNow.map(p => p.date);
  const modalityTrend = topModalities.map(m => {
    const key = m.modalityId ?? "null";
    const byDate = trendMap.get(key) ?? new Map<string, number>();
    return {
      modalityId: m.modalityId,
      name: m.name,
      color: m.color,
      points: dates.map(d => ({ date: d, count: byDate.get(d) ?? 0 })),
    };
  });

  const narratives = buildAttendanceNarratives({
    periodLabel: period.label,
    totalCheckIns: kpis.totalCheckIns,
    topClassName: topClasses[0]?.name ?? null,
    topClassCount: topClasses[0]?.count ?? 0,
    peakSlot,
    peakSlotAvgCount,
  });

  const payload: AttendancePayload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    period,
    compare,
    filters: echo,
    kpis,
    trend,
    topClasses,
    bottomClasses,
    classByWeekday,
    heatmap,
    modalityBreakdown,
    levelBreakdown: levelCounts,
    audienceBreakdown: audienceCounts,
    modalityTrend,
    narratives,
  };

  logQuery("attendance", performance.now() - t0, {
    period: period.label,
    mods: echo.modality.slugs.join(",") || undefined,
    level: echo.level.slug || undefined,
    auds: echo.audience.slugs.join(",") || undefined,
  });
  return payload;
  },
  ["attendance-analytics"],
  { revalidate: ANALYTICS_CACHE_SECONDS, tags: ["analytics", "attendance-analytics"] },
);

// ─── Members ────────────────────────────────────────────────────────────────

export async function getMembersAnalytics(params: AnalyticsParams = {}): Promise<MembersPayload> {
  await requireAdmin();
  return membersAnalyticsCached(params);
}

const membersAnalyticsCached = unstable_cache(
  async (params: AnalyticsParams): Promise<MembersPayload> => {
  const t0 = performance.now();
  const period = await buildPeriod(params);
  const svc = createServiceClient();

  const [mostConsistent, newMembers, atRisk] = await Promise.all([
    mostConsistentMembers(svc, period, 10),
    newMembersWithActivity(svc, period, 10),
    atRiskMembers(svc, AT_RISK_DAYS, 25),
  ]);

  const narratives = buildMembersNarratives({
    periodLabel: period.label,
    mostConsistentName: mostConsistent[0]?.name ?? null,
    mostConsistentCount: mostConsistent[0]?.count ?? 0,
    atRiskCount: atRisk.length,
    newMembersCount: newMembers.length,
  });

  const payload: MembersPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    period,
    mostConsistent,
    newMembers,
    atRisk,
    narratives,
  };

  logQuery("members", performance.now() - t0, { period: period.label });
  return payload;
  },
  ["members-analytics"],
  { revalidate: ANALYTICS_CACHE_SECONDS, tags: ["analytics", "members-analytics"] },
);

// ─── Instructors ────────────────────────────────────────────────────────────

export async function getInstructorsAnalytics(params: AnalyticsParams = {}): Promise<InstructorsPayload> {
  await requireAdmin();
  return instructorsAnalyticsCached(params);
}

const instructorsAnalyticsCached = unstable_cache(
  async (params: AnalyticsParams): Promise<InstructorsPayload> => {
  const t0 = performance.now();
  const period = await buildPeriod(params);
  const svc = createServiceClient();

  const leaderboard = await instructorLeaderboard(svc, period);
  const top3 = leaderboard.filter(r => r.totalAttendance > 0).slice(0, 3);

  const trendMap = await instructorDailyTrend(
    svc,
    period,
    top3.map(r => r.instructorId),
  );

  // Enumerate every date once so all series render aligned even with gaps.
  const dates = (await dailyCheckIns(svc, period)).map(p => p.date);
  const topTrend = top3.map(r => {
    const key = r.instructorId ?? "null";
    const byDate = trendMap.get(key) ?? new Map<string, number>();
    return {
      instructorId: r.instructorId,
      name: r.name,
      points: dates.map(d => ({ date: d, count: byDate.get(d) ?? 0 })),
    };
  });

  const unassigned = leaderboard.find(r => r.instructorId === null);
  const totalAttendance = leaderboard.reduce((s, r) => s + r.totalAttendance, 0);

  const narratives = buildInstructorsNarratives({
    periodLabel: period.label,
    topInstructorName: leaderboard[0]?.instructorId != null ? leaderboard[0]?.name ?? null : null,
    topInstructorAttendance: leaderboard[0]?.instructorId != null ? leaderboard[0]?.totalAttendance ?? 0 : 0,
    leaderCount: leaderboard.filter(r => r.totalAttendance > 0).length,
    unassignedAttendance: unassigned?.totalAttendance ?? 0,
    totalAttendance,
  });

  const payload: InstructorsPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    period,
    leaderboard,
    topTrend,
    narratives,
  };

  logQuery("instructors", performance.now() - t0, { period: period.label });
  return payload;
  },
  ["instructors-analytics"],
  { revalidate: ANALYTICS_CACHE_SECONDS, tags: ["analytics", "instructors-analytics"] },
);
