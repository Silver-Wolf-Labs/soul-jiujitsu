/**
 * The check-in write path, shared by every surface that can record attendance:
 * the front-desk kiosk, the member portal, and admin-initiated check-ins.
 *
 * This is a PLAIN module, not a `"use server"` one, and that is deliberate. In a
 * `"use server"` file every export becomes a server action callable from any
 * browser, so a function that trusts its `memberId` argument cannot live there —
 * it would be a public "check anyone in" endpoint. Keeping it here means the
 * only way to reach it is through a server action that has already established
 * authorization.
 *
 * SECURITY: `writeCheckIn` trusts its memberId completely. Every caller MUST
 * authorize first — requireKioskSession() for the kiosk, the session→member
 * lookup for the portal, requireAdmin() for admin writes.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { gymToday } from "@/lib/gym-time";

/** Where a check-in came from. Mirrors the `check_ins_source_check` constraint. */
export type CheckInSource = "kiosk" | "portal" | "admin";

/**
 * A badge unlocked by a just-recorded check-in, as returned by the
 * evaluate_member_badges RPC. Shaped for the kiosk celebration screen.
 */
export interface AwardedBadge {
  badge_slug: string;
  badge_name: string;
  /** lucide-react icon name — resolve through badgeIcon(). */
  badge_icon: string;
  badge_tier: "bronze" | "silver" | "gold" | "legendary";
}

export interface WriteCheckInResult {
  ok: boolean;
  error?: string;
  checkInId?: number;
  awardedBadges?: AwardedBadge[];
}

/** A service-role client. Named for readability in the helper signatures. */
type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Record a check-in, with no authorization of its own — see the module header.
 *
 * Every surface funnels through here so duplicate-detection, instructor
 * resolution, the taxonomy snapshot and the gamification award stay in lockstep.
 * They must: a portal check-in that skipped `awardGamification` would silently
 * earn no XP and break the member's streak, which is exactly the kind of bug
 * that only shows up as "the app is lying to me" weeks later.
 *
 * `classDate` defaults to today in gym time. Only the admin path passes one, and
 * only because staff sometimes record attendance the morning after.
 */
export async function writeCheckIn(
  supabase: ServiceClient,
  {
    memberId,
    className,
    scheduleSlotId,
    source,
    classDate,
  }: {
    memberId: number;
    className: string;
    scheduleSlotId?: number | null;
    source: CheckInSource;
    classDate?: string;
  },
): Promise<WriteCheckInResult> {
  const date = classDate ?? (await gymToday());

  // Prevent double check-in for the same slot/class on the same day.
  // When a scheduleSlotId is available use it (handles same-name classes at
  // different times). Fall back to class_name match when there is no slot ID.
  const dupQuery = supabase
    .from("check_ins")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("class_date", date);

  const { count } = scheduleSlotId
    ? await dupQuery.eq("schedule_slot_id", scheduleSlotId)
    : await dupQuery.eq("class_name", className);

  if ((count ?? 0) > 0) {
    return { ok: false, error: "Already checked in to this class today" };
  }

  // Resolve the slot's teachers. Multi-instructor classes credit every
  // teacher via `check_in_instructors`; the scalar `check_ins.instructor_id`
  // column mirrors the primary for backward compatibility with existing
  // reads. Taxonomy (modality / level / focus / audience) is snapshotted
  // by the separate `snapshot_check_in_taxonomy` RPC call below.
  const assignments = await resolveSlotInstructors(supabase, scheduleSlotId);
  const primary = assignments[0] ?? { instructor_id: null, instructor_name: null };

  // Return the new id so the caller can offer a same-session "Oops, undo"
  // action without having to re-query.
  const { data, error } = await supabase
    .from("check_ins")
    .insert({
      member_id: memberId,
      schedule_slot_id: scheduleSlotId ?? null,
      class_name: className,
      class_date: date,
      source,
      instructor_id: primary.instructor_id,
      instructor_name: primary.instructor_name,
    })
    .select("id")
    .single();

  if (error) {
    // Log the real Postgres message, return a human one. This path is reachable
    // from the member-facing portal, and it showed a member the string
    // `new row for relation "check_ins" violates check constraint
    // "check_ins_source_check"` — which tells them nothing they can act on and
    // leaks the schema. `error.message` here is a database error, never a
    // validation message: the duplicate case is caught above and returns its own
    // wording, so anything arriving here is a bug or an unapplied migration.
    console.error("[writeCheckIn] insert failed:", error.message, {
      memberId,
      source,
      scheduleSlotId,
    });
    return {
      ok: false,
      error: "Could not record the check-in. Please try again or ask the front desk.",
    };
  }
  const checkInId = data?.id as number | undefined;
  if (checkInId && assignments.length > 0) {
    await writeCheckInInstructors(supabase, checkInId, assignments);
  }
  // Snapshot the slot's taxonomy (modality / level scalars + focus /
  // audience junctions). Non-fatal if the slot has no taxonomy — we log
  // the exception inside the helper but don't propagate to the caller,
  // since the check-in row itself is already durable.
  if (checkInId && scheduleSlotId) {
    await snapshotCheckInTaxonomy(supabase, checkInId, scheduleSlotId);
  }
  // XP + auto-badges. Runs after the taxonomy snapshot because the modality
  // badge rules read the snapshotted slot data.
  const awardedBadges = checkInId
    ? await awardGamification(supabase, checkInId, memberId)
    : [];
  return { ok: true, checkInId, awardedBadges };
}

/**
 * Grant XP for a check-in and award any auto-badges it just unlocked.
 *
 * Non-fatal by design, exactly like the taxonomy snapshot below: the check-in
 * row is already durable and attendance is the number the gym bills on, so a
 * gamification failure must never surface as a failed check-in. The RPCs are
 * idempotent, so anything missed here is recovered by re-running
 * `SELECT public.backfill_gamification();`.
 *
 * Returns the badges awarded so the caller can celebrate them on screen.
 */
export async function awardGamification(
  supabase: ServiceClient,
  checkInId: number,
  memberId: number,
): Promise<AwardedBadge[]> {
  try {
    const today = await gymToday();
    // XP first: evaluate_member_badges credits badge XP into the same ledger,
    // and a streak badge should be judged with today's class already counted.
    await supabase.rpc("award_check_in_xp", { p_check_in_id: checkInId });

    const { data, error } = await supabase.rpc("evaluate_member_badges", {
      p_member_id: memberId,
      p_today: today,
    });
    if (error) throw new Error(error.message);

    return (data ?? []) as AwardedBadge[];
  } catch (e) {
    console.error("[gamification] award failed for check-in", checkInId, e);
    return [];
  }
}

/**
 * Snapshot the slot's taxonomy (modality / level scalars + focus /
 * audience junctions) onto a just-inserted check-in row.
 *
 * The RPC is gated with `GRANT EXECUTE ... TO service_role` only — callers are
 * already using a service-role client after establishing authorization.
 *
 * Scalar snapshot failures surface as an exception (primary correctness
 * signal). Focus/audience junction-insert failures are trapped inside
 * the RPC's nested EXCEPTION blocks and do NOT reach us — those are
 * analytics nice-to-haves, not a reason to roll back the check-in.
 */
export async function snapshotCheckInTaxonomy(
  supabase: ServiceClient,
  checkInId: number,
  slotId: number | null | undefined,
): Promise<void> {
  if (!slotId) return;
  const { error } = await supabase.rpc("snapshot_check_in_taxonomy", {
    p_check_in_id: checkInId,
    p_slot_id:     slotId,
  });
  if (error) {
    // Non-fatal from the user's perspective — the check-in itself
    // succeeded. Log loudly so analytics gaps surface in operator logs
    // instead of silently compounding.
    console.error("[snapshot_check_in_taxonomy] RPC failed:", error.message);
  }
}

/**
 * Read the slot's teacher assignments (instructors junction) in
 * primary-first order, each carrying a fresh name snapshot.
 * Returns `[]` when `slotId` is null or the slot has no instructors.
 */
export async function resolveSlotInstructors(
  supabase: ServiceClient,
  slotId: number | null | undefined,
): Promise<{ instructor_id: number | null; instructor_name: string | null }[]> {
  if (!slotId) return [];
  const { data } = await supabase
    .from("schedule_slot_instructors")
    .select("instructor_id, sort_order, instructors!inner(id, name)")
    .eq("schedule_slot_id", slotId)
    .order("sort_order", { ascending: true });
  if (!data || data.length === 0) return [];
  return data.map(row => {
    const r = row as unknown as {
      instructor_id: number;
      sort_order: number;
      instructors: { id: number; name: string } | { id: number; name: string }[] | null;
    };
    const inst = Array.isArray(r.instructors) ? r.instructors[0] : r.instructors;
    return {
      instructor_id: r.instructor_id,
      instructor_name: inst?.name ?? null,
    };
  });
}

/** Fan out attribution rows for a check-in. Idempotent per check_in_id. */
export async function writeCheckInInstructors(
  supabase: ServiceClient,
  checkInId: number,
  assignments: { instructor_id: number | null; instructor_name: string | null }[],
): Promise<void> {
  if (assignments.length === 0) return;
  const rows = assignments.map((a, i) => ({
    check_in_id: checkInId,
    instructor_id: a.instructor_id,
    instructor_name: a.instructor_name,
    sort_order: i,
  }));
  const { error } = await supabase.from("check_in_instructors").insert(rows);
  if (error) {
    // Non-fatal: the check-in itself succeeded. Attribution can be
    // back-filled from the scalar `check_ins.instructor_id` as a
    // fallback. Log and continue.
    console.error("[check_in_instructors] insert failed:", error.message);
  }
}
