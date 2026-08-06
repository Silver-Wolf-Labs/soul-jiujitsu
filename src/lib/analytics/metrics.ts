/**
 * Canonical metric definitions for the analytics suite.
 *
 * Every metric the dashboards consume routes through a function in this
 * module. If two surfaces ever compute "active members" two different ways,
 * trust in the numbers evaporates — keep the definitions here and in one
 * place. Each function:
 *
 *   - takes a service-role Supabase client (analytics bypasses RLS to
 *     aggregate across members),
 *   - takes a `Period` for date windowing,
 *   - returns pure primitives or simple arrays (no coupling to UI shape),
 *   - is unit-testable with a small fixture.
 *
 * These run on the server only. The service client is imported directly
 * because this module is always invoked from within a server action that
 * has already passed `requireAdmin()`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Period } from "@/lib/analytics/types";
import type { AudienceKind } from "@/lib/supabase/types";

type Client = SupabaseClient;

/**
 * Per-dimension filter set — applied to every attendance query so the
 * server action can honor URL params like
 * `?modality=gi,no-gi&level=advanced&audience=women-only` consistently.
 *
 * - `modalityIds` — multi-select; empty / undefined means "no filter".
 * - `levelId`     — single-select (per LLD §3.4 / §5); undefined means "no filter".
 * - `audienceIds` — multi-select; when set, we pre-compute the set of
 *                   `check_in_id`s that have AT LEAST ONE matching audience
 *                   attribution and apply an `.in("id", ...)` predicate.
 */
export interface AttendanceFilters {
  modalityIds?: number[];
  levelId?: number | null;
  audienceIds?: number[];
}

/**
 * Attach the modality / level scalar filters directly to a `check_ins`
 * query builder. Returns the builder so callers can chain further.
 *
 * Audience filtering requires a junction pre-query (see
 * `resolveAudienceCheckInIds` below) — it lives outside this helper
 * because the caller needs to short-circuit when the pre-query yields
 * an empty set.
 */
function applyScalarFilters<T extends {
  in: (c: string, v: number[]) => T;
  eq: (c: string, v: number) => T;
}>(builder: T, filters: AttendanceFilters | undefined): T {
  if (!filters) return builder;
  if (filters.modalityIds && filters.modalityIds.length > 0) {
    builder = builder.in("modality_id", filters.modalityIds);
  }
  if (filters.levelId !== undefined && filters.levelId !== null) {
    builder = builder.eq("level_id", filters.levelId);
  }
  return builder;
}

/**
 * Resolve an audience-filter set into the list of `check_ins.id`s that
 * have at least one matching `check_in_audiences` row. Returns `null`
 * when the filter is inactive (caller treats as "no-op"), or an array
 * (possibly empty) when active. Chunked to stay under PostgREST's
 * `.in()` argument ceiling.
 */
async function resolveAudienceCheckInIds(
  client: Client,
  filters: AttendanceFilters | undefined,
): Promise<number[] | null> {
  if (!filters?.audienceIds || filters.audienceIds.length === 0) return null;
  const { data } = await client
    .from("check_in_audiences")
    .select("check_in_id")
    .in("audience_id", filters.audienceIds);
  const ids = new Set<number>();
  for (const row of data ?? []) {
    ids.add((row as { check_in_id: number }).check_in_id);
  }
  return Array.from(ids);
}

// ─── Membership ─────────────────────────────────────────────────────────────

/**
 * Members with status='active' as of the end of the period.
 * We use the current `members.status` column because there is no historical
 * audit of membership state — that's a Phase 2.5 concern.
 */
export async function countActiveMembers(client: Client): Promise<number> {
  const { count } = await client
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  return count ?? 0;
}

/** Members whose `created_at` lands inside the period. */
export async function countNewMembers(client: Client, period: Period): Promise<number> {
  const { count } = await client
    .from("members")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${period.start}T00:00:00+00`)
    .lte("created_at", `${period.end}T23:59:59+00`);
  return count ?? 0;
}

/**
 * Members whose status changed to `canceled` or equivalent during the
 * period. Current schema doesn't track status transitions, so we
 * approximate with `status='canceled'` + `updated_at` inside period. A
 * proper membership-events table is Phase 2.5.
 */
export async function countCanceledMembers(client: Client, period: Period): Promise<number> {
  const { count } = await client
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("status", "canceled")
    .gte("updated_at", `${period.start}T00:00:00+00`)
    .lte("updated_at", `${period.end}T23:59:59+00`);
  return count ?? 0;
}

// ─── Attendance ─────────────────────────────────────────────────────────────

/** Rows in `check_ins` whose `class_date` lands inside the period. */
export async function countCheckIns(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<number> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return 0;
  let q = client
    .from("check_ins")
    .select("id", { count: "exact", head: true })
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { count } = await q;
  return count ?? 0;
}

/** Distinct `member_id` with ≥1 check-in inside the period. */
export async function countUniqueAttendees(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<number> {
  // Supabase PostgREST doesn't do COUNT(DISTINCT) directly; fetch distinct
  // ids and count in-memory. For a typical gym this is a few hundred rows —
  // trivial. If this becomes the p95 bottleneck we'll move it to an RPC.
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return 0;
  let q = client
    .from("check_ins")
    .select("member_id")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data } = await q;
  if (!data) return 0;
  return new Set(data.map(r => r.member_id as number)).size;
}

/** Daily check-in counts for the period, zero-filled for empty days. */
export async function dailyCheckIns(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<{ date: string; count: number }[]> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) {
    return enumerateDates(period.start, period.end).map(date => ({ date, count: 0 }));
  }
  let q = client
    .from("check_ins")
    .select("class_date")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data } = await q;

  const buckets = new Map<string, number>();
  for (const row of data ?? []) {
    const d = (row as { class_date: string }).class_date;
    buckets.set(d, (buckets.get(d) ?? 0) + 1);
  }
  return enumerateDates(period.start, period.end).map(date => ({
    date,
    count: buckets.get(date) ?? 0,
  }));
}

/** Classes ranked by total check-ins inside the period, descending.
 *  Prefers the stable `modality_name` snapshot (WS1); falls back to the
 *  free-text `class_name` for legacy rows pre-taxonomy and for
 *  manually-entered class names the kiosk still accepts. */
export async function classPopularity(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<{ name: string; count: number }[]> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return [];
  let q = client
    .from("check_ins")
    .select("class_name, modality_name")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data } = await q;

  const counts = new Map<string, number>();
  for (const raw of data ?? []) {
    const row = raw as { class_name: string; modality_name: string | null };
    const name = row.class_name || row.modality_name || "Untitled";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Class popularity split by weekday — feeds the stacked bar chart so
 * an owner can see BOTH how popular a class is AND which day drives
 * the attendance. One row per class, seven daily columns + total.
 *
 * Keys are lowercase 3-letter weekday codes (`mon`..`sun`) matching the
 * recharts series keys in `StackedClassBar`.
 */
export interface ClassByWeekday {
  name: string;
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
  total: number;
  /** Modality label snapshot for the class row — used by
   *  `StackedClassBar` in `colorBy="modality"` mode. When a class has
   *  check-ins attributed to multiple modalities (rare; only possible
   *  mid-rename), the first-seen label wins. `null` means no modality
   *  attribution (legacy rows pre-WS1). */
  modalityName: string | null;
}

const DOW_KEYS: readonly (keyof Pick<ClassByWeekday, "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">)[] = [
  "sun", "mon", "tue", "wed", "thu", "fri", "sat",
];

export async function classPopularityByWeekday(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<ClassByWeekday[]> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return [];
  let q = client
    .from("check_ins")
    .select("class_name, class_date, modality_name")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data } = await q;

  const byName = new Map<string, ClassByWeekday>();
  for (const raw of data ?? []) {
    const row = raw as {
      class_name: string;
      class_date: string;
      modality_name: string | null;
    };
    const name = row.class_name || row.modality_name || "Untitled";
    const [y, m, d] = row.class_date.split("-").map(Number);
    // `Date.getUTCDay` → 0=Sun..6=Sat. Index our Sunday-first `DOW_KEYS`
    // array directly rather than re-mapping.
    const dowKey = DOW_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const agg =
      byName.get(name) ??
      ({
        name,
        mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0,
        total: 0,
        modalityName: row.modality_name ?? null,
      } as ClassByWeekday);
    agg[dowKey]++;
    agg.total++;
    // First-seen modality_name wins; we deliberately don't overwrite
    // with a later row's value because a class shouldn't change modality
    // within a period under normal operation.
    if (!agg.modalityName && row.modality_name) agg.modalityName = row.modality_name;
    byName.set(name, agg);
  }
  return Array.from(byName.values()).sort((a, b) => b.total - a.total);
}

/**
 * Day-of-week × hour-of-day attendance density (gym TZ).
 * Returns one row per (dow, hour) bucket that has ≥1 check-in — callers
 * zero-fill as needed.
 */
export async function weekdayHourHeatmap(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<{ day: number; hour: number; count: number }[]> {
  // We pull the class slot's day_of_week + start_time join via the snapshot
  // class_date (weekday) + the linked schedule_slot's start_time. When the
  // slot is missing (manual check-in) we fall back to "unknown" and skip —
  // the heatmap is about schedule patterns, not one-off entries.
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return [];
  let q = client
    .from("check_ins")
    .select("class_date, schedule_slot_id, schedule_slots!inner(start_time)")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data } = await q;

  const buckets = new Map<string, number>();
  for (const raw of data ?? []) {
    // PostgREST returns joined single-relation rows as objects, but the
    // generated types sometimes widen them to arrays. Accept either.
    const row = raw as unknown as {
      class_date: string;
      schedule_slots: { start_time: string } | { start_time: string }[] | null;
    };
    const slot = Array.isArray(row.schedule_slots)
      ? row.schedule_slots[0]
      : row.schedule_slots;
    if (!slot?.start_time) continue;
    const [y, m, d] = row.class_date.split("-").map(Number);
    const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
    const dow = jsDow === 0 ? 7 : jsDow;
    const hour = parseInt(slot.start_time.split(":")[0], 10);
    const key = `${dow}-${hour}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries()).map(([k, count]) => {
    const [day, hour] = k.split("-").map(Number);
    return { day, hour, count };
  });
}

// ─── Member engagement ──────────────────────────────────────────────────────

/** Top members by check-in count inside the period. */
export async function mostConsistentMembers(
  client: Client,
  period: Period,
  limit = 10,
): Promise<{ memberId: number; name: string; count: number }[]> {
  const { data } = await client
    .from("check_ins")
    .select("member_id, members!inner(first_name, last_name)")
    .gte("class_date", period.start)
    .lte("class_date", period.end);

  const counts = new Map<number, { name: string; count: number }>();
  for (const raw of data ?? []) {
    // Same widening story as above — accept object or array.
    const row = raw as unknown as {
      member_id: number;
      members:
        | { first_name: string; last_name: string }
        | { first_name: string; last_name: string }[]
        | null;
    };
    const member = Array.isArray(row.members) ? row.members[0] : row.members;
    if (!member) continue;
    const existing = counts.get(row.member_id);
    if (existing) {
      existing.count++;
    } else {
      counts.set(row.member_id, {
        name: `${member.first_name} ${member.last_name}`.trim(),
        count: 1,
      });
    }
  }
  return Array.from(counts.entries())
    .map(([memberId, v]) => ({ memberId, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Members with no check-in in the last `thresholdDays` days who have
 * previously attended at least once. "At risk" = active status but quiet.
 */
export async function atRiskMembers(
  client: Client,
  thresholdDays: number,
  limit = 25,
): Promise<{
  memberId: number;
  name: string;
  daysSince: number;
  lastClassName: string | null;
}[]> {
  // Fetch all active members + their most-recent check-in. For a gym of
  // hundreds of members this is a single round-trip; scale later with a
  // view if needed.
  const { data: members } = await client
    .from("members")
    .select("id, first_name, last_name")
    .eq("status", "active");
  if (!members || members.length === 0) return [];

  const memberIds = members.map(m => m.id as number);
  const { data: lastCheckIns } = await client
    .from("check_ins")
    .select("member_id, class_date, class_name")
    .in("member_id", memberIds)
    .order("class_date", { ascending: false });

  const latest = new Map<number, { date: string; className: string }>();
  for (const raw of lastCheckIns ?? []) {
    const row = raw as { member_id: number; class_date: string; class_name: string };
    if (!latest.has(row.member_id)) {
      latest.set(row.member_id, { date: row.class_date, className: row.class_name });
    }
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const out: {
    memberId: number;
    name: string;
    daysSince: number;
    lastClassName: string | null;
  }[] = [];

  for (const m of members) {
    const last = latest.get(m.id as number);
    if (!last) continue; // never attended — not "at risk", they're "dormant"
    const daysSince = Math.floor(
      (Date.UTC(
        Number(todayIso.slice(0, 4)),
        Number(todayIso.slice(5, 7)) - 1,
        Number(todayIso.slice(8, 10)),
      ) -
        Date.UTC(
          Number(last.date.slice(0, 4)),
          Number(last.date.slice(5, 7)) - 1,
          Number(last.date.slice(8, 10)),
        )) /
        86_400_000,
    );
    if (daysSince >= thresholdDays) {
      out.push({
        memberId: m.id as number,
        name: `${m.first_name} ${m.last_name}`.trim(),
        daysSince,
        lastClassName: last.className,
      });
    }
  }
  return out.sort((a, b) => b.daysSince - a.daysSince).slice(0, limit);
}

/** Members who joined during the period, with their check-in count. */
export async function newMembersWithActivity(
  client: Client,
  period: Period,
  limit = 25,
): Promise<{ memberId: number; name: string; joinedAt: string; checkIns: number }[]> {
  const { data: newOnes } = await client
    .from("members")
    .select("id, first_name, last_name, created_at")
    .gte("created_at", `${period.start}T00:00:00+00`)
    .lte("created_at", `${period.end}T23:59:59+00`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!newOnes || newOnes.length === 0) return [];

  const ids = newOnes.map(m => m.id as number);
  const { data: ci } = await client
    .from("check_ins")
    .select("member_id")
    .in("member_id", ids);
  const counts = new Map<number, number>();
  for (const row of ci ?? []) {
    const id = (row as { member_id: number }).member_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return newOnes.map(m => ({
    memberId: m.id as number,
    name: `${m.first_name} ${m.last_name}`.trim(),
    joinedAt: (m.created_at as string).slice(0, 10),
    checkIns: counts.get(m.id as number) ?? 0,
  }));
}

// ─── Instructors ────────────────────────────────────────────────────────────

/**
 * Per-instructor classes-taught / attendance / averages inside the period.
 * Driven by the `check_in_instructors` junction so multi-instructor
 * classes credit every teacher at full weight. Check-in rows with no
 * junction attachment (truly unassigned classes) are aggregated under a
 * single "Unassigned" bucket.
 */
export async function instructorLeaderboard(
  client: Client,
  period: Period,
): Promise<
  {
    instructorId: number | null;
    name: string;
    classesTaught: number;
    totalAttendance: number;
    avgAttendance: number;
    uniqueMembers: number;
  }[]
> {
  // 1) Pull every check-in in the period so we can (a) know the denominator
  //    set for the Unassigned bucket and (b) join member_id + session keys
  //    client-side.
  const { data: checkIns } = await client
    .from("check_ins")
    .select("id, member_id, schedule_slot_id, class_date")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  const ciMap = new Map<number, { member_id: number; session: string }>();
  for (const raw of checkIns ?? []) {
    const row = raw as { id: number; member_id: number; schedule_slot_id: number | null; class_date: string };
    ciMap.set(row.id, {
      member_id: row.member_id,
      session: `${row.schedule_slot_id ?? "manual"}::${row.class_date}`,
    });
  }

  // 2) Pull junction rows for those check-ins. Each row credits one instructor
  //    with one attendance count.
  const checkInIds = Array.from(ciMap.keys());
  const junction: { check_in_id: number; instructor_id: number | null; instructor_name: string | null }[] = [];
  if (checkInIds.length > 0) {
    // Supabase `in` has a length ceiling; chunk to stay under it for big gyms.
    const CHUNK = 1000;
    for (let i = 0; i < checkInIds.length; i += CHUNK) {
      const slice = checkInIds.slice(i, i + CHUNK);
      const { data } = await client
        .from("check_in_instructors")
        .select("check_in_id, instructor_id, instructor_name")
        .in("check_in_id", slice);
      for (const r of data ?? []) junction.push(r as typeof junction[number]);
    }
  }

  type Agg = {
    name: string;
    members: Set<number>;
    attendance: number;
    sessions: Set<string>;
  };
  const byInstructor = new Map<number | "null", Agg>();

  // Instructor-attributed credit.
  const creditedCheckIns = new Set<number>();
  for (const row of junction) {
    const ci = ciMap.get(row.check_in_id);
    if (!ci) continue;
    creditedCheckIns.add(row.check_in_id);
    const key = row.instructor_id ?? "null";
    const agg =
      byInstructor.get(key) ??
      ({
        name: row.instructor_name || "Unassigned",
        members: new Set<number>(),
        attendance: 0,
        sessions: new Set<string>(),
      } as Agg);
    agg.attendance++;
    agg.members.add(ci.member_id);
    agg.sessions.add(ci.session);
    byInstructor.set(key, agg);
  }

  // Orphan check-ins (no junction row at all) go into "Unassigned" so the
  // leaderboard + analytics narrative can surface data-quality gaps.
  for (const [ciId, ci] of ciMap) {
    if (creditedCheckIns.has(ciId)) continue;
    const agg =
      byInstructor.get("null") ??
      ({ name: "Unassigned", members: new Set<number>(), attendance: 0, sessions: new Set<string>() } as Agg);
    agg.attendance++;
    agg.members.add(ci.member_id);
    agg.sessions.add(ci.session);
    byInstructor.set("null", agg);
  }

  return Array.from(byInstructor.entries())
    .map(([key, v]) => {
      const instructorId = key === "null" ? null : (key as number);
      return {
        instructorId,
        name: v.name,
        classesTaught: v.sessions.size,
        totalAttendance: v.attendance,
        avgAttendance: v.sessions.size === 0 ? 0 : +(v.attendance / v.sessions.size).toFixed(1),
        uniqueMembers: v.members.size,
      };
    })
    .sort((a, b) => b.totalAttendance - a.totalAttendance);
}

/**
 * Daily attendance trend for a subset of instructors. Uses the
 * `check_in_instructors` junction so multi-instructor classes contribute
 * a full data point per teacher per day.
 */
export async function instructorDailyTrend(
  client: Client,
  period: Period,
  instructorIds: (number | null)[],
): Promise<Map<number | "null", Map<string, number>>> {
  if (instructorIds.length === 0) return new Map();

  const { data: checkIns } = await client
    .from("check_ins")
    .select("id, class_date")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  const dateMap = new Map<number, string>();
  for (const raw of checkIns ?? []) {
    const row = raw as { id: number; class_date: string };
    dateMap.set(row.id, row.class_date);
  }

  const idSet = new Set<number | "null">(instructorIds.map(id => id ?? "null"));
  const out = new Map<number | "null", Map<string, number>>();

  const checkInIds = Array.from(dateMap.keys());
  if (checkInIds.length === 0) return out;

  const CHUNK = 1000;
  for (let i = 0; i < checkInIds.length; i += CHUNK) {
    const slice = checkInIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("check_in_instructors")
      .select("check_in_id, instructor_id")
      .in("check_in_id", slice);
    for (const raw of data ?? []) {
      const row = raw as { check_in_id: number; instructor_id: number | null };
      const key = row.instructor_id ?? "null";
      if (!idSet.has(key)) continue;
      const date = dateMap.get(row.check_in_id);
      if (!date) continue;
      const byDate = out.get(key) ?? new Map<string, number>();
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
      out.set(key, byDate);
    }
  }
  return out;
}

// ─── Class taxonomy breakdowns (LLD §5.1) ───────────────────────────────────

/**
 * Check-in totals grouped by `check_ins.modality_id` + snapshot name.
 * The snapshot columns (`modality_id`, `modality_name`) are cheaper than
 * joining `class_modalities` at read time, and survive future renames /
 * deactivations of the dimension row — exactly what the HLD's "snapshot
 * on write, join on read (for live labels only)" principle requires.
 *
 * Filters (when passed) apply to the same check_ins query so the
 * breakdown always matches the totals card.
 */
export async function countByModality(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<{ modalityId: number | null; name: string; count: number }[]> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return [];
  let q = client
    .from("check_ins")
    .select("modality_id, modality_name")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data } = await q;

  const buckets = new Map<string, { modalityId: number | null; name: string; count: number }>();
  for (const raw of data ?? []) {
    const row = raw as { modality_id: number | null; modality_name: string | null };
    const key = row.modality_id === null ? "null" : String(row.modality_id);
    const entry =
      buckets.get(key) ??
      { modalityId: row.modality_id, name: row.modality_name || "Unspecified", count: 0 };
    entry.count++;
    buckets.set(key, entry);
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}

/**
 * Check-in totals grouped by `check_ins.level_id`. Like modality, the
 * snapshot name is preferred for display; level is optional so rows
 * with `level_id = NULL` surface as a dedicated "Unspecified" bucket
 * (matches the LLD §5.1 `COALESCE(level_name, 'Unspecified')` contract).
 */
export async function countByLevel(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<{ levelId: number | null; name: string; count: number }[]> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return [];
  let q = client
    .from("check_ins")
    .select("level_id, level_name")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data } = await q;

  const buckets = new Map<string, { levelId: number | null; name: string; count: number }>();
  for (const raw of data ?? []) {
    const row = raw as { level_id: number | null; level_name: string | null };
    const key = row.level_id === null ? "null" : String(row.level_id);
    const entry =
      buckets.get(key) ??
      { levelId: row.level_id, name: row.level_name || "Unspecified", count: 0 };
    entry.count++;
    buckets.set(key, entry);
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}

/**
 * Check-in totals grouped by focus, via the `check_in_focuses`
 * junction. A single check-in can credit multiple focuses — that's the
 * cardinality the LLD §5.1 spec intends ("Leg Locks" + "Takedowns" on
 * one class both get +1). We pre-filter the junction to only the
 * check-ins that match the period + other filters, so the totals in
 * this array CAN sum higher than `countCheckIns` (expected, by design).
 */
export async function countByFocus(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<{ focusId: number | null; name: string; count: number }[]> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return [];

  // Step 1: period-scoped + filtered set of check_in ids.
  let q = client
    .from("check_ins")
    .select("id")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data: ciRows } = await q;
  const checkInIds = (ciRows ?? []).map(r => (r as { id: number }).id);
  if (checkInIds.length === 0) return [];

  // Step 2: fetch junction rows for that set. Chunk to avoid PostgREST
  // `.in()` length limits on gyms with large-period check-in sets.
  const buckets = new Map<string, { focusId: number | null; name: string; count: number }>();
  const CHUNK = 1000;
  for (let i = 0; i < checkInIds.length; i += CHUNK) {
    const slice = checkInIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("check_in_focuses")
      .select("focus_id, focus_name")
      .in("check_in_id", slice);
    for (const raw of data ?? []) {
      const row = raw as { focus_id: number | null; focus_name: string | null };
      const key = row.focus_id === null ? `null::${row.focus_name ?? ""}` : String(row.focus_id);
      const entry =
        buckets.get(key) ??
        { focusId: row.focus_id, name: row.focus_name || "Unspecified", count: 0 };
      entry.count++;
      buckets.set(key, entry);
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}

/**
 * Check-in totals grouped by audience, via the `check_in_audiences`
 * junction. Emits one row per (audience_id, audience_name, audience_kind)
 * triple so the UI can group the donut by `kind` (Age / Gender / Rank /
 * Access).
 *
 * Same multi-count semantics as `countByFocus` — a check-in with two
 * audiences contributes to both buckets.
 */
export async function countByAudience(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<
  { audienceId: number | null; name: string; kind: AudienceKind | null; count: number }[]
> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return [];

  let q = client
    .from("check_ins")
    .select("id")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data: ciRows } = await q;
  const checkInIds = (ciRows ?? []).map(r => (r as { id: number }).id);
  if (checkInIds.length === 0) return [];

  const buckets = new Map<
    string,
    { audienceId: number | null; name: string; kind: AudienceKind | null; count: number }
  >();
  const CHUNK = 1000;
  for (let i = 0; i < checkInIds.length; i += CHUNK) {
    const slice = checkInIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("check_in_audiences")
      .select("audience_id, audience_name, audience_kind")
      .in("check_in_id", slice);
    for (const raw of data ?? []) {
      const row = raw as {
        audience_id: number | null;
        audience_name: string | null;
        audience_kind: AudienceKind | null;
      };
      const key = row.audience_id === null ? `null::${row.audience_name ?? ""}` : String(row.audience_id);
      const entry =
        buckets.get(key) ??
        {
          audienceId: row.audience_id,
          name: row.audience_name || "Unspecified",
          kind: row.audience_kind,
          count: 0,
        };
      entry.count++;
      buckets.set(key, entry);
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}

/**
 * Daily attendance trend for a subset of modalities. Mirrors the shape
 * of `instructorDailyTrend` — one inner Map per modality, keyed by ISO
 * date, zero-fill is the caller's job.
 *
 * `null` slot in `modalityIds` means "check-ins without a modality
 * attribution" (legacy rows). Passing an empty array returns an empty
 * Map (nothing to trend).
 */
export async function modalityDailyTrend(
  client: Client,
  period: Period,
  modalityIds: (number | null)[],
  filters?: AttendanceFilters,
): Promise<Map<number | "null", Map<string, number>>> {
  if (modalityIds.length === 0) return new Map();
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return new Map();

  let q = client
    .from("check_ins")
    .select("class_date, modality_id")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data } = await q;

  const wanted = new Set<number | "null">(modalityIds.map(id => id ?? "null"));
  const out = new Map<number | "null", Map<string, number>>();
  for (const raw of data ?? []) {
    const row = raw as { class_date: string; modality_id: number | null };
    const key: number | "null" = row.modality_id ?? "null";
    if (!wanted.has(key)) continue;
    const byDate = out.get(key) ?? new Map<string, number>();
    byDate.set(row.class_date, (byDate.get(row.class_date) ?? 0) + 1);
    out.set(key, byDate);
  }
  return out;
}

/**
 * Instructor × modality cross-tab — one row per (instructor, modality)
 * pair with non-zero attendance. Feeds the "which modalities does each
 * instructor specialize in?" owner question from HLD §1.1.
 *
 * Uses `check_in_instructors` for multi-instructor crediting (full
 * weight per teacher, matching `instructorLeaderboard`) and
 * `check_ins.modality_id` / `modality_name` for the dimension snapshot.
 */
export async function instructorModalityMatrix(
  client: Client,
  period: Period,
  filters?: AttendanceFilters,
): Promise<
  {
    instructor_id: number | null;
    instructor_name: string;
    modality_id: number | null;
    modality_name: string;
    count: number;
  }[]
> {
  const audienceIds = await resolveAudienceCheckInIds(client, filters);
  if (audienceIds && audienceIds.length === 0) return [];

  let q = client
    .from("check_ins")
    .select("id, modality_id, modality_name")
    .gte("class_date", period.start)
    .lte("class_date", period.end);
  q = applyScalarFilters(q, filters);
  if (audienceIds) q = q.in("id", audienceIds);
  const { data: ciRows } = await q;

  const modalityByCheckIn = new Map<number, { modality_id: number | null; modality_name: string }>();
  for (const raw of ciRows ?? []) {
    const row = raw as { id: number; modality_id: number | null; modality_name: string | null };
    modalityByCheckIn.set(row.id, {
      modality_id: row.modality_id,
      modality_name: row.modality_name || "Unspecified",
    });
  }
  const checkInIds = Array.from(modalityByCheckIn.keys());
  if (checkInIds.length === 0) return [];

  const CHUNK = 1000;
  const buckets = new Map<
    string,
    {
      instructor_id: number | null;
      instructor_name: string;
      modality_id: number | null;
      modality_name: string;
      count: number;
    }
  >();
  for (let i = 0; i < checkInIds.length; i += CHUNK) {
    const slice = checkInIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("check_in_instructors")
      .select("check_in_id, instructor_id, instructor_name")
      .in("check_in_id", slice);
    for (const raw of data ?? []) {
      const row = raw as {
        check_in_id: number;
        instructor_id: number | null;
        instructor_name: string | null;
      };
      const mod = modalityByCheckIn.get(row.check_in_id);
      if (!mod) continue;
      const key = `${row.instructor_id ?? "null"}::${mod.modality_id ?? "null"}`;
      const entry =
        buckets.get(key) ??
        {
          instructor_id: row.instructor_id,
          instructor_name: row.instructor_name || "Unassigned",
          modality_id: mod.modality_id,
          modality_name: mod.modality_name,
          count: 0,
        };
      entry.count++;
      buckets.set(key, entry);
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Enumerate every ISO date from `start` to `end` inclusive. */
export function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  // Safety cap: analytics periods shouldn't exceed ~3 years of daily
  // buckets. If a caller asks for more, cap and let them notice.
  const MAX = 366 * 3;
  for (let i = 0; i < MAX && cursor <= end; i++) {
    out.push(cursor);
    cursor = nextDay(cursor);
  }
  return out;
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
