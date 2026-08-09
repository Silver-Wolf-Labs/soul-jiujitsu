"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@/lib/audit";
import { leaderboardOptOutSchema } from "@/lib/validations/leaderboard";
import { trackedBadgeSchema } from "@/lib/validations/badge-tracker";
import { badgeProgress, MAX_TRACKED_BADGES, type TrackedBadgeEntry } from "@/lib/badge-progress";
import { gymToday, gymPgDay } from "@/lib/gym-time";
import { writeCheckIn, type AwardedBadge } from "@/lib/check-in-core";
import type { KioskMemberStats, GymRankings } from "@/lib/actions/check-ins";
import type {
  CheckInRow,
  BeltHistory,
  MemberGamification,
  Badge,
  EarnedBadge,
  TeamMemberEntry,
  TeamActivityEntry,
} from "@/lib/supabase/types";

/**
 * Portal-facing error copy.
 *
 * Every `error` string these actions return is rendered verbatim to a member, so
 * it has to be Spanish and it has to come from the catalogue. Resolved through
 * getTranslations rather than a literal because a "use server" module can't call
 * the React hook — this is the server-side equivalent.
 *
 * Only for messages a member READS. A raw `error.message` from Postgres is a
 * developer artefact: it gets logged and replaced with `generic` rather than
 * translated, both because it leaks schema and because there is no finite set of
 * strings to translate.
 */
async function errors() {
  return getTranslations("portal.errors");
}

export async function updateOwnProfile(data: {
  first_name: string;
  last_name: string;
  phone: string;
  birth_month?: number | null;
  birth_year?: number | null;
  gender?: string | null;
}): Promise<{ success: true } | { error: string }> {
  const t = await errors();
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: t("notAuthenticated") };

  const { error } = await supabase
    .from("members")
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone,
      birth_month: data.birth_month || null,
      birth_year: data.birth_year || null,
      gender: data.gender || null,
    })
    .eq("user_id", userData.user.id);

  if (error) {
    console.error("[updateOwnProfile] update failed:", error.message);
    return { error: t("generic") };
  }
  return { success: true };
}

export async function updateOwnEmergencyContact(data: {
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}): Promise<{ success: true } | { error: string }> {
  const t = await errors();
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: t("notAuthenticated") };

  const { error } = await supabase
    .from("members")
    .update({
      emergency_contact_name: data.emergency_contact_name || null,
      emergency_contact_phone: data.emergency_contact_phone || null,
      emergency_contact_relationship: data.emergency_contact_relationship || null,
    })
    .eq("user_id", userData.user.id);

  if (error) {
    console.error("[updateOwnEmergencyContact] update failed:", error.message);
    return { error: t("generic") };
  }
  return { success: true };
}

/**
 * Self-enrollment — trial plans only.
 *
 * A trial costs nothing, so a member can start one themselves and the system is
 * telling the truth when it marks them `trialing`. A paid plan is the opposite:
 * money changes hands in person with the profe, and this code has no way to know
 * whether that happened. Letting the portal write `active` on request would
 * manufacture a paid membership out of a button press, so paid plans are
 * rejected here and the portal points the member at the gym instead.
 *
 * The check is server-side rather than only in the UI because a server action is
 * a public endpoint — hiding the button would not stop a crafted call.
 */
export async function selfEnrollInPlan(
  plan_id: number
): Promise<{ success: true } | { error: string }> {
  const t = await errors();
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: t("notAuthenticated") };

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("user_id", userData.user.id)
    .single();
  if (!member) return { error: t("memberNotFound") };

  // Guard: no existing active/paused/trialing membership
  const { data: existing } = await supabase
    .from("member_memberships")
    .select("id")
    .eq("member_id", member.id)
    .in("status", ["active", "trialing", "paused", "past_due"])
    .limit(1)
    .maybeSingle();
  if (existing) return { error: t("alreadyEnrolled") };

  const { data: plan } = await supabase
    .from("membership_plans")
    .select("price_cents, name, billing_interval, status, visible, trial_days")
    .eq("id", plan_id)
    .single();
  if (!plan) return { error: t("planNotFound") };
  if (plan.status !== "active" || !plan.visible) return { error: t("planUnavailable") };
  if (plan.billing_interval === "one_time") return { error: t("dropInNotMembership") };

  // Paid plans are arranged with the profe at the gym — see the doc comment.
  if (plan.trial_days <= 0) return { error: t("paidPlanInPerson") };

  const adminSupabase = createServiceClient();

  const { data: rpcData, error: rpcError } = await adminSupabase.rpc(
    "enroll_trial_membership_tx",
    {
      p_member_id: member.id,
      p_plan_id: plan_id,
      p_locked_price_cents: plan.price_cents,
      p_plan_name: plan.name,
      p_plan_billing_interval: plan.billing_interval,
    }
  );
  if (rpcError) {
    console.error("[selfEnrollInPlan] enroll_trial_membership_tx failed:", rpcError.message);
    return { error: t("generic") };
  }
  if (rpcData?.error === "already_enrolled") {
    return { error: t("alreadyEnrolled") };
  }
  // The RPC only ever returns 'already_enrolled' (handled above), so anything
  // else is a snake_case code from a future migration — logged and shown as
  // the catch-all rather than rendered raw, which would put an identifier
  // like "some_new_code" in front of a member.
  if (rpcData?.error) {
    console.error("[selfEnrollInPlan] unrecognised RPC error code:", rpcData.error);
    return { error: t("generic") };
  }

  await logAuditEvent("CREATE", "member_memberships", String(rpcData.membership_id), {
    member_id: member.id,
    plan_id,
    locked_price_cents: plan.price_cents,
    plan_name: plan.name,
    source: "self_enrollment_trial",
    trial_days: plan.trial_days,
  });

  return { success: true };
}

// NOTE: belt, stripes, and belt_awarded_at are managed by admins only.
// Members can only record when they personally started training BJJ.
export async function updateOwnTrainingInfo(data: {
  training_started_at: string | null;
}): Promise<{ success: true } | { error: string }> {
  const t = await errors();
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: t("notAuthenticated") };

  const { error } = await supabase
    .from("members")
    .update({
      training_started_at: data.training_started_at || null,
    })
    .eq("user_id", userData.user.id);

  if (error) {
    console.error("[updateOwnTrainingInfo] update failed:", error.message);
    return { error: t("generic") };
  }
  return { success: true };
}

/**
 * Self-service undo for a check-in the authenticated member made today.
 *
 * Ownership is established by matching the check-in's member_id against the
 * member row attached to the caller's auth user. The class_date must be
 * today (gym timezone) — this stays a "correct a mistake from today" feature
 * rather than a history-rewriting tool. Older check-ins are admin-only to
 * delete.
 */
export async function undoOwnCheckIn(
  checkInId: number,
): Promise<{ success: true } | { error: string }> {
  const t = await errors();
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: t("notAuthenticated") };

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userData.user.id)
    .single();
  if (!member) return { error: t("memberNotFound") };

  // Use the service client here because check_ins has no row-level policy
  // permitting members to delete their own rows — and we don't want to add
  // one that could be abused via the raw REST endpoint. All ownership +
  // same-day enforcement is done here in the server action.
  const adminSupabase = createServiceClient();

  const { data: row, error: readErr } = await adminSupabase
    .from("check_ins")
    .select("id, member_id, class_date, class_name")
    .eq("id", checkInId)
    .maybeSingle();
  if (readErr) {
    console.error("[undoOwnCheckIn] read failed:", readErr.message);
    return { error: t("generic") };
  }
  if (!row) return { error: t("checkInNotFound") };
  if (row.member_id !== member.id) return { error: t("notYourCheckIn") };

  // Gym-local "today" — uses the same clock as the kiosk so late-night undo
  // and late-night check-in agree on the date boundary.
  const today = await gymToday();
  if (row.class_date !== today) {
    return { error: t("undoTodayOnly") };
  }

  const { error } = await adminSupabase
    .from("check_ins")
    .delete()
    .eq("id", checkInId);
  if (error) {
    console.error("[undoOwnCheckIn] delete failed:", error.message);
    return { error: t("generic") };
  }

  await logAuditEvent("DELETE", "check_ins", String(checkInId), {
    source: "member-undo",
    member_id: member.id,
    class_name: row.class_name,
  });
  return { success: true };
}

// ── Portal stats (authenticated member, server-side ownership) ─────────────────
//
// These mirror the kiosk stats actions but resolve the member_id from the
// caller's auth session — preventing client-side spoofing of arbitrary IDs.
// The service client is used for the RPC calls so RLS doesn't block them,
// but the ownership check (user → member_id) is enforced here in app code.

/**
 * Why resolveOwnMember gave up, carried on the thrown error.
 *
 * The message on these throws is a developer artefact: every caller except
 * selfCheckIn lets them escape into the error boundary, where a member sees the
 * generic error page and never the string. selfCheckIn is the one that renders
 * the failure inline, so it reads this code and picks its own Spanish copy —
 * matching on `error.message` would have coupled member-facing copy to a log line.
 */
type OwnMemberFailure = "not_authenticated" | "member_not_found";

class OwnMemberError extends Error {
  constructor(readonly code: OwnMemberFailure, message: string) {
    super(message);
    this.name = "OwnMemberError";
  }
}

/**
 * Resolves the authenticated user's member record.
 * Throws if the session is missing or the user has no linked member row.
 */
async function resolveOwnMember(): Promise<{ id: number }> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new OwnMemberError("not_authenticated", "Not authenticated");
  }

  const { data: member, error } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) throw new OwnMemberError("member_not_found", "Member record not found");
  return member;
}

/**
 * Returns motivational stats for the authenticated portal member.
 * Identical shape to KioskMemberStats so StatsTilesGrid can consume both.
 */
export async function getOwnMemberStats(): Promise<KioskMemberStats> {
  const member = await resolveOwnMember();
  const service = createServiceClient();
  const today = await gymToday();

  const [statsResult, memberResult] = await Promise.all([
    service.rpc("get_member_motivational_stats", { p_member_id: member.id, p_today: today }),
    service.from("members").select("belt, stripes, created_at").eq("id", member.id).single(),
  ]);

  const s = (statsResult.data?.[0] ?? {}) as Record<string, unknown>;

  return {
    classes_this_month: Number(s.classes_this_month ?? 0),
    month_rank:         Number(s.month_rank ?? 1),
    month_total:        Number(s.month_total ?? 0),
    week_streak:        Number(s.week_streak ?? 0),
    all_time_classes:   Number(s.all_time_classes ?? 0),
    classes_this_week:  Number(s.classes_this_week ?? 0),
    avg_per_week:       Math.round((Number(s.classes_last_28d ?? 0) / 4) * 10) / 10,
    belt:               memberResult.data?.belt ?? "white",
    stripes:            memberResult.data?.stripes ?? 0,
    joined_at:          memberResult.data?.created_at ?? null,
    last_class_name:    (s.last_class_name as string | null) ?? null,
    last_class_date:    (s.last_class_date as string | null) ?? null,
  };
}

/**
 * Returns the authenticated portal member's gym rankings.
 * Identical shape to GymRankings so StatsTilesGrid can consume both.
 */
export async function getOwnGymRankings(): Promise<GymRankings> {
  const member = await resolveOwnMember();
  const service = createServiceClient();
  const today = await gymToday();

  const { data, error } = await service.rpc("get_member_gym_rankings", {
    p_member_id: member.id,
    p_today: today,
  });

  if (error) throw new Error(error.message);

  const r = (data?.[0] ?? {}) as Record<string, unknown>;
  return {
    month:   { rank: Number(r.month_rank   ?? 1), total: Number(r.month_total   ?? 0) },
    streak:  { rank: Number(r.streak_rank  ?? 1), total: Number(r.streak_total  ?? 0) },
    alltime: { rank: Number(r.alltime_rank ?? 1), total: Number(r.alltime_total ?? 0) },
    week:    { rank: Number(r.week_rank    ?? 1), total: Number(r.week_total    ?? 0) },
  };
}

/**
 * Returns the authenticated member's check-in history (most recent first).
 * Capped at rowCap (default 50) to avoid giant payloads.
 */
export async function getOwnCheckIns(rowCap = 50): Promise<CheckInRow[]> {
  const member = await resolveOwnMember();
  const service = createServiceClient();

  const { data, error } = await service
    .from("check_ins")
    .select("id, class_name, class_date, checked_in_at, source")
    .eq("member_id", member.id)
    .order("checked_in_at", { ascending: false })
    .limit(rowCap);

  if (error) throw new Error(error.message);
  return (data ?? []) as CheckInRow[];
}

/**
 * Returns XP / level / streak / badge counts for the authenticated member.
 * One RPC round-trip; see get_member_gamification in the gamification migration.
 */
export async function getOwnGamification(): Promise<MemberGamification> {
  const member = await resolveOwnMember();
  const service = createServiceClient();
  const today = await gymToday();

  const { data, error } = await service.rpc("get_member_gamification", {
    p_member_id: member.id,
    p_today: today,
  });

  if (error) throw new Error(error.message);

  const g = (data?.[0] ?? {}) as Record<string, unknown>;
  return {
    xp_total:       Number(g.xp_total       ?? 0),
    level:          Number(g.level          ?? 1),
    xp_into_level:  Number(g.xp_into_level  ?? 0),
    // Never 0 — it's a progress-bar denominator, and level 1 costs 100 XP.
    xp_for_level:   Number(g.xp_for_level   ?? 100) || 100,
    streak_days:    Number(g.streak_days    ?? 0),
    longest_streak: Number(g.longest_streak ?? 0),
    badges_earned:  Number(g.badges_earned  ?? 0),
    badges_total:   Number(g.badges_total   ?? 0),
    unseen_badges:  Number(g.unseen_badges  ?? 0),
  };
}

/**
 * The catalogue columns the portal renders, i.e. the `Badge` interface.
 *
 * Hoisted to module scope now that three actions here select it (the wall, the
 * tracker, and the tracker's picker) — an explicit list rather than `*` so the
 * rule_* columns stay server-side. They are the profe's tuning knobs, not
 * something to ship to every member's browser, and `Badge` has no fields for them.
 */
const BADGE_FIELDS =
  "id, slug, name, description, icon, tier, category, xp_reward, secret, active, sort_order";

/**
 * Returns the badge catalogue plus which of them the member has earned.
 *
 * Unearned badges are returned too: showing them as locked silhouettes is the
 * whole point — they're the goals. Secret badges are filtered out unless the
 * member already has them, so a surprise stays a surprise.
 */
export async function getOwnBadges(): Promise<{ earned: EarnedBadge[]; locked: Badge[] }> {
  const member = await resolveOwnMember();
  const service = createServiceClient();

  const [catalogueResult, earnedResult] = await Promise.all([
    service.from("badges").select(BADGE_FIELDS).eq("active", true).order("sort_order"),
    service
      .from("member_badges")
      .select(`awarded_via, awarded_at, note, seen_at, badges (${BADGE_FIELDS})`)
      .eq("member_id", member.id)
      .order("awarded_at", { ascending: false }),
  ]);

  if (catalogueResult.error) throw new Error(catalogueResult.error.message);
  if (earnedResult.error) throw new Error(earnedResult.error.message);

  const earned: EarnedBadge[] = (earnedResult.data ?? [])
    // A row whose badge was deactivated still counts as earned, but the join
    // returns null for it — drop those rather than render an empty tile.
    .filter((row) => row.badges)
    .map((row) => ({
      badge:       row.badges as unknown as Badge,
      awarded_via: row.awarded_via as "auto" | "manual",
      awarded_at:  row.awarded_at as string,
      note:        (row.note as string | null) ?? null,
      seen_at:     (row.seen_at as string | null) ?? null,
    }));

  const earnedIds = new Set(earned.map((e) => e.badge.id));
  const locked = ((catalogueResult.data ?? []) as unknown as Badge[])
    .filter((b) => !earnedIds.has(b.id) && !b.secret);

  return { earned, locked };
}

/**
 * Marks the member's newly-earned badges as seen, so the celebration fires once.
 * Called from the client after the modal is dismissed.
 *
 * The `error` strings below stay untranslated on purpose: BadgeCelebration calls
 * this fire-and-forget (`void markOwnBadgesSeen()`) and never reads the result,
 * so nothing here reaches a member's screen.
 */
export async function markOwnBadgesSeen(): Promise<{ success: true } | { error: string }> {
  try {
    const member = await resolveOwnMember();
    const service = createServiceClient();

    const { error } = await service
      .from("member_badges")
      .update({ seen_at: new Date().toISOString() })
      .eq("member_id", member.id)
      .is("seen_at", null);

    if (error) return { error: error.message };
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Returns the authenticated member's belt history (most recent first).
 * Uses the service client (bypasses RLS) behind server-side ownership
 * enforcement — the member_id is resolved from the caller's auth session,
 * not taken from the client.
 */
export async function getOwnBeltHistory(): Promise<BeltHistory[]> {
  const member = await resolveOwnMember();
  const service = createServiceClient();

  const { data, error } = await service
    .from("belt_history")
    .select("*")
    .eq("member_id", member.id)
    .order("promoted_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Self check-in from the portal ────────────────────────────────────────────
//
// Until now the only way to record attendance was the front-desk kiosk (or an
// admin doing it for you), so a member whose phone was in their hand but who
// walked past a busy desk earned nothing for the class they just took. These two
// actions close that gap.
//
// There is deliberately NO time-window or geolocation gate: the gym asked for
// unrestricted self check-in. `source: "portal"` is what makes that decision
// auditable — staff can always tell a phone check-in from one corroborated by
// someone standing at the desk, and undo it if it's abused.

/** A class the member can check into today, for the portal's self check-in list. */
export interface PortalTodayClass {
  /** schedule_slots.id — also the dedup key against today's existing check-ins. */
  id: number;
  name: string;
  /** "HH:MM:SS" in gym-local time. */
  start_time: string;
  modality_name: string | null;
  /** True when the member already checked into this slot today. */
  already_checked_in: boolean;
}

/**
 * Today's classes, each flagged with whether this member already attended it.
 *
 * Unlike the kiosk's getTodaysClasses this returns no audience/eligibility data.
 * The kiosk needs it to warn a walk-in at the desk; the portal doesn't gate on
 * it, and audience rows carry gender/age criteria that shouldn't ship to a
 * client that has no use for them.
 */
export async function getOwnTodayClasses(): Promise<PortalTodayClass[]> {
  const member = await resolveOwnMember();
  const service = createServiceClient();
  const [pgDay, today] = await Promise.all([gymPgDay(), gymToday()]);

  const [slotsResult, checkInsResult] = await Promise.all([
    service
      .from("schedule_slots")
      .select("id, title, start_time, modality:class_modalities!left(name)")
      .eq("day_of_week", pgDay)
      .eq("active", true)
      .order("start_time"),
    service
      .from("check_ins")
      .select("schedule_slot_id, class_name")
      .eq("member_id", member.id)
      .eq("class_date", today),
  ]);

  if (slotsResult.error) throw new Error(slotsResult.error.message);

  // Match the dedup rule in writeCheckIn: slot id when the row has one, class
  // name otherwise. Rows without a slot id come from manually-added kiosk
  // classes, and would otherwise let a member double-book the same class.
  const doneSlotIds = new Set<number>();
  const doneNames = new Set<string>();
  for (const row of checkInsResult.data ?? []) {
    if (row.schedule_slot_id != null) doneSlotIds.add(row.schedule_slot_id as number);
    else doneNames.add(row.class_name as string);
  }

  type Row = {
    id: number;
    title: string;
    start_time: string;
    modality: { name: string } | { name: string }[] | null;
  };

  return ((slotsResult.data as Row[] | null) ?? []).map((s) => {
    const modality = Array.isArray(s.modality) ? s.modality[0] : s.modality;
    return {
      id: s.id,
      name: s.title,
      start_time: s.start_time,
      modality_name: modality?.name ?? null,
      already_checked_in: doneSlotIds.has(s.id) || doneNames.has(s.title),
    };
  });
}

/**
 * Check the authenticated member into one of today's classes.
 *
 * The slot id comes from the client, but the member id never does — it's
 * resolved from the session, so the worst a tampered request can do is check
 * the caller into a class they didn't attend, which staff can see (source
 * "portal") and undo. Passing a member id would have made this a
 * "check anyone in" endpoint.
 *
 * The slot is re-read server-side rather than trusting a class name from the
 * client, otherwise a member could invent a class that was never on the
 * schedule and collect XP for it.
 */
export async function selfCheckIn(
  scheduleSlotId: number,
): Promise<{ success: true; awardedBadges: AwardedBadge[] } | { error: string }> {
  const t = await errors();

  let member: { id: number };
  try {
    member = await resolveOwnMember();
  } catch (e) {
    if (e instanceof OwnMemberError) {
      return {
        error: e.code === "member_not_found" ? t("memberNotFound") : t("notAuthenticated"),
      };
    }
    // Anything else is the members read failing — a DB error, not something the
    // member did.
    console.error("[selfCheckIn] resolveOwnMember failed:", e);
    return { error: t("generic") };
  }

  const service = createServiceClient();
  const pgDay = await gymPgDay();

  const { data: slot, error: slotError } = await service
    .from("schedule_slots")
    .select("id, title, day_of_week, active")
    .eq("id", scheduleSlotId)
    .maybeSingle();

  if (slotError) {
    console.error("[selfCheckIn] slot read failed:", slotError.message);
    return { error: t("generic") };
  }
  if (!slot || !slot.active) return { error: t("classNotScheduled") };
  // A slot from another weekday means a stale page — the member left the portal
  // open past midnight. Say so rather than silently recording the wrong day.
  if (slot.day_of_week !== pgDay) {
    return { error: t("classNotToday") };
  }

  const result = await writeCheckIn(service, {
    memberId: member.id,
    className: slot.title as string,
    scheduleSlotId: slot.id as number,
    source: "portal",
  });
  // Translated from `reason`, not `result.error` — writeCheckIn is a plain shared
  // module with no request context, so its `error` field is English. See the
  // WriteCheckInFailure doc there.
  if (!result.ok) {
    return {
      error: result.reason === "duplicate" ? t("alreadyCheckedIn") : t("checkInFailed"),
    };
  }

  await logAuditEvent("CREATE", "check_ins", String(result.checkInId ?? ""), {
    source: "member-self-checkin",
    member_id: member.id,
    class_name: slot.title,
    schedule_slot_id: slot.id,
  });

  return { success: true, awardedBadges: result.awardedBadges ?? [] };
}

// ── Social team feed ─────────────────────────────────────────────────────────
//
// Both of these go through SECURITY DEFINER RPCs that resolve the caller
// themselves via auth.uid() (see 20260809000000_social_team_feed.sql).
//
// They are therefore the ONLY portal reads here that must use the session-scoped
// client rather than the service client. Verified against staging: a service-role
// call succeeds but returns `[]`, because it carries no auth.uid() so
// current_member_id() resolves to NULL. That failure mode is silent and looks
// exactly like a gym where nobody has ever trained.
//
// resolveOwnMember() still runs first so the UI can distinguish "you have no
// member row" from "nobody has trained yet".

/**
 * The team leaderboard — every active member's level, XP, streak and badge count.
 *
 * This is the deliberate privacy boundary of the social feature: members see
 * each other's progress under a "First L." name, and nothing else. The gym asked
 * for XP, badges and streaks to be visible; contact details were never part of
 * that, and the RPC's projection is what enforces it.
 */
export async function getTeamLeaderboard(limit = 50): Promise<TeamMemberEntry[]> {
  await resolveOwnMember();
  const supabase = createClient();
  const today = await gymToday();

  const { data, error } = await supabase.rpc("get_team_leaderboard", {
    p_today: today,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TeamMemberEntry[];
}

/**
 * Recent check-ins and badge awards across the gym, newest first.
 *
 * Secret badges are filtered out inside the RPC so the feed can't spoil one for
 * a member who hasn't earned it yet.
 */
export async function getTeamActivity(limit = 30, days = 14): Promise<TeamActivityEntry[]> {
  await resolveOwnMember();
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_team_activity", {
    p_limit: limit,
    p_days: days,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TeamActivityEntry[];
}

// ── Leaderboard opt-out ──────────────────────────────────────────────────────
//
// A member can take themselves off the ranking without asking staff. The flag
// lives on `members.leaderboard_opt_out` and the exclusion is enforced inside
// get_team_leaderboard (20260812000000_leaderboard_opt_out.sql), not here — the
// RPC is the only thing that decides what one member may see of another, and
// filtering in app code would leave the raw RPC still returning the hidden rows
// to anyone who called it directly with the publishable key.
//
// The flag is NOT on the leaderboard projection. TeamMemberEntry mirrors the
// RPC's column set, so adding a column would change the shape every caller
// destructures; and a per-row "this person is hidden" field is the opposite of
// the point — it would publish exactly the fact the member is trying to withhold.
// The viewer's own state is read separately instead.

/**
 * Whether the authenticated member is currently hiding from the ranking.
 *
 * Reads through the service client behind resolveOwnMember's ownership check,
 * matching every other own-data read here. The session client would work too
 * (`member_read_own` covers it) but the pattern in this file is one lookup to
 * resolve the member, then service reads scoped by that id.
 */
export async function getOwnLeaderboardOptOut(): Promise<boolean> {
  const member = await resolveOwnMember();
  const service = createServiceClient();

  const { data, error } = await service
    .from("members")
    .select("leaderboard_opt_out")
    .eq("id", member.id)
    .single();

  if (error) throw new Error(error.message);
  // Defaults to visible. A deploy that lands this code before the migration
  // returns undefined here, and "on the board" is the pre-existing behaviour —
  // failing closed would hide the whole gym from itself over a missing column.
  return data?.leaderboard_opt_out === true;
}

/**
 * Sets the authenticated member's ranking visibility.
 *
 * Takes the desired state rather than flipping, so a double-tap on a slow
 * connection is idempotent instead of a silent no-op. Returns the state that is
 * now stored, which is what the client renders — a toggle that reports back what
 * it actually did can't drift from the database on a failed write.
 *
 * The member id comes from the session; there is no parameter for it and no code
 * path that writes another member's row. `.eq("user_id", …)` is what enforces
 * that on the service client, which bypasses RLS — the same shape as
 * updateOwnProfile above, and the reason it matters more here is that this write
 * is on a column the member IS allowed to change, so a wrong id would succeed.
 */
export async function setOwnLeaderboardOptOut(
  optOut: boolean
): Promise<{ success: true; optOut: boolean } | { error: string }> {
  const t = await errors();
  const parsed = leaderboardOptOutSchema.safeParse({ opt_out: optOut });
  if (!parsed.success) return { error: t("generic") };

  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: t("notAuthenticated") };

  const service = createServiceClient();
  const { data, error } = await service
    .from("members")
    .update({ leaderboard_opt_out: parsed.data.opt_out })
    .eq("user_id", userData.user.id)
    .select("id, leaderboard_opt_out")
    .maybeSingle();

  if (error) {
    console.error("[setOwnLeaderboardOptOut] update failed:", error.message);
    return { error: t("generic") };
  }
  // No row updated: the session is valid but not linked to a member (an
  // admin-only account). Distinguished from a write error because the copy is
  // different and neither is the generic message.
  if (!data) return { error: t("memberNotFound") };

  // Audited: it changes what other members can see, so "when did I disappear
  // from the board" has an answer that isn't guesswork. TOGGLE with
  // { field, from, to } is the shape every other boolean flip in actions/ logs;
  // `source` marks it as the member's own doing rather than an admin's, the same
  // distinction selfCheckIn records.
  const stored = data.leaderboard_opt_out === true;
  await logAuditEvent("TOGGLE", "members", data.id, {
    field: "leaderboard_opt_out",
    from: !stored,
    to: stored,
    source: "member-self-service",
  });

  // The board is server-rendered into /portal, so the next navigation there must
  // not serve a cached page built from the old flag. TeamFeed also refetches on
  // its own after the toggle, which covers the current view; this covers the
  // member coming back to the page later.
  revalidatePath("/portal");

  return { success: true, optOut: stored };
}

// ── Badge tracker ────────────────────────────────────────────────────────────
//
// Up to three chosen badges, each with a progress bar under it. The badge wall
// already shows every unearned badge; what it can't show is how CLOSE you are to
// any of them, because the rules live in the row and only SQL evaluates them.
//
// Three rather than one (20260816000000): a member chasing "50 clases" had nothing
// to show for the Saturday they trained or the streak they were on, so a single
// slot made every other kind of progress invisible. The cap itself is structural —
// PRIMARY KEY (member_id, slot) + CHECK (slot BETWEEN 1 AND 3) — and the checks
// here exist to produce a sentence a member can read instead of a database error.
//
// The counters come from member_badge_progress (20260814000000), which is also
// what member_qualifies_for_badge is now defined in terms of. That indirection is
// the point: a bar that reads 50/50 next to a badge that was never awarded is the
// bug this feature would otherwise ship with, and it is impossible when the bar
// and the award read the same function.

/**
 * The badges the authenticated member is chasing, oldest first, with progress.
 *
 * Returns `[]` rather than throwing when there are no objectives — that's the
 * empty state, and it is also what a database that hasn't run 20260816000000 yet
 * looks like. A missing table must not take down a portal page that renders fine
 * without a tracker, which is the same reasoning getOwnLeaderboardOptOut
 * documents.
 *
 * Ordered by `created_at`, deliberately not by `slot`: slots are reused, so a
 * member who drops their first goal and picks another would see the new one jump
 * to the top of the card. See the migration's comment.
 *
 * The progress RPCs run concurrently — three sequential round trips on a page a
 * member opens constantly is a cost with nothing to show for it, since no call
 * depends on another's result.
 */
export async function getOwnTrackedBadges(): Promise<TrackedBadgeEntry[]> {
  const member = await resolveOwnMember();
  const service = createServiceClient();

  const { data: rows, error } = await service
    .from("member_tracked_badges")
    .select(`badge_id, badges!member_tracked_badges_badge_id_fkey (${BADGE_FIELDS})`)
    .eq("member_id", member.id)
    .order("created_at");

  // Includes "relation does not exist" on a pre-migration database.
  if (error) throw new Error(error.message);

  const badges = (rows ?? [])
    .map((r) => (r as unknown as { badges: Badge | null }).badges)
    .filter((b): b is Badge => b !== null);
  if (badges.length === 0) return [];

  const today = await gymToday();

  return Promise.all(
    badges.map(async (badge) => {
      const { data: progressRows, error: progressError } = await service.rpc(
        "member_badge_progress",
        { p_member_id: member.id, p_badge_id: badge.id, p_today: today }
      );

      // A progress RPC failure loses one bar, not the goal and not the other two:
      // the member still sees which badge they picked, which is most of the value.
      // `indeterminate` is the shape the UI already renders for "no number
      // available", so a single failing rule degrades to a medal with no bar
      // rather than an exception that empties the whole card.
      if (progressError) {
        console.error(
          `[getOwnTrackedBadges] progress RPC failed for badge ${badge.id}:`,
          progressError.message
        );
        return { badge, progress: { kind: "indeterminate", ruleKind: null } as const };
      }

      return { badge, progress: badgeProgress(progressRows?.[0] ?? null) };
    })
  );
}

/**
 * Badges the member may pick as an objective.
 *
 * Four exclusions, and each has its own reason:
 *
 *   • already earned — there is nothing left to track, and the award trigger
 *     removes the objective anyway (20260816000000), so offering it would produce
 *     a goal that erases itself.
 *   • already being tracked — with three slots this is newly possible and it is
 *     the one exclusion the database would also catch, via
 *     UNIQUE (member_id, badge_id). Filtering it here is what turns "duplicate key
 *     value violates unique constraint" into a row the picker simply doesn't show.
 *   • secret — the badge exists to be a surprise. Listing it in a picker spoils
 *     it more thoroughly than the locked grid ever could, since the picker shows
 *     the name and description.
 *   • manual-only (rule_kind IS NULL) — the profe awards "primera sumisión" by
 *     hand when he sees it. There is no rule, so there is no progress, so a
 *     tracker pointed at it is a card that can never move. Members can still see
 *     these on the wall; they just aren't goals the app can follow.
 *
 * The rule_kind filter runs in the query rather than on the returned rows because
 * BADGE_FIELDS deliberately doesn't include rule_kind — see its comment.
 */
export async function getTrackableBadges(): Promise<Badge[]> {
  const member = await resolveOwnMember();
  const service = createServiceClient();

  const [catalogueResult, earnedResult, trackedResult] = await Promise.all([
    service
      .from("badges")
      .select(BADGE_FIELDS)
      .eq("active", true)
      .eq("secret", false)
      .not("rule_kind", "is", null)
      .order("sort_order"),
    service.from("member_badges").select("badge_id").eq("member_id", member.id),
    service.from("member_tracked_badges").select("badge_id").eq("member_id", member.id),
  ]);

  if (catalogueResult.error) throw new Error(catalogueResult.error.message);
  if (earnedResult.error) throw new Error(earnedResult.error.message);
  if (trackedResult.error) throw new Error(trackedResult.error.message);

  const excluded = new Set([
    ...(earnedResult.data ?? []).map((r) => r.badge_id as number),
    ...(trackedResult.data ?? []).map((r) => r.badge_id as number),
  ]);
  return ((catalogueResult.data ?? []) as unknown as Badge[]).filter((b) => !excluded.has(b.id));
}

/**
 * Resolves the calling session to a member id for a tracker write.
 *
 * Separate from resolveOwnMember() because these two actions need an *error
 * string*, not an exception: `resolveOwnMember` throws, and both callers return
 * `{ error }` so the card can show a sentence next to the button that caused it.
 * The lookup is by `user_id` from the session rather than an id from the client —
 * the same shape as setOwnLeaderboardOptOut, and it matters for the same reason.
 * The service client bypasses RLS, so writing the wrong row would succeed
 * silently.
 */
async function resolveOwnMemberIdForTracker(
  t: Awaited<ReturnType<typeof errors>>
): Promise<{ memberId: number } | { error: string }> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: t("notAuthenticated") };

  const { data, error } = await createServiceClient()
    .from("members")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    console.error("[tracker] member lookup failed:", error.message);
    return { error: t("generic") };
  }
  // A valid session that isn't linked to a member (an admin-only account).
  // Distinct from a write error, and neither is the generic message.
  if (!data) return { error: t("memberNotFound") };

  return { memberId: data.id as number };
}

/**
 * Adds a badge to the authenticated member's objectives, up to three.
 *
 * Add-one rather than replace-the-set: a set-based action would make "drop one of
 * my three" a request that carries the other two, and a client that computed that
 * list from a stale render would silently delete a goal the member added on their
 * phone a minute ago. Add and remove each name exactly the badge they act on.
 *
 * The slot is chosen here — the lowest free number in 1..3 — rather than by a
 * sequence, because slots are meant to be reused: PRIMARY KEY (member_id, slot)
 * with CHECK (slot BETWEEN 1 AND 3) is what caps the member at three, and a
 * monotonic counter would exhaust the range after three adds and removes. Display
 * order is `created_at`, so which slot a goal lands in is invisible.
 *
 * Two writers racing here both compute the same free slot and one loses on the
 * primary key. That is the intended outcome and it is why the cap lives in the
 * index: the loser gets `alreadyTrackingMax` below, not a fourth goal.
 *
 * Eligibility is re-checked rather than trusted from the picker, because a server
 * action is a public endpoint and the picker is just a UI. The two checks that are
 * security rather than UX — secret and inactive — are enforced again by
 * trg_enforce_tracked_badge_eligible, which is the only one of the three that runs
 * on the service client's writes at all.
 *
 * Not audited, deliberately. logAuditEvent exists for changes somebody might later
 * need to account for — what another member can see, what a membership costs. Which
 * badges you feel like chasing this month is nobody's business but yours, and
 * writing it to an audit trail an admin reads would make a private choice
 * reviewable.
 */
export async function addOwnTrackedBadge(
  badgeId: number
): Promise<{ success: true; badgeId: number } | { error: string }> {
  const t = await errors();
  const parsed = trackedBadgeSchema.safeParse({ badge_id: badgeId });
  if (!parsed.success) return { error: t("generic") };
  const target = parsed.data.badge_id;

  const resolved = await resolveOwnMemberIdForTracker(t);
  if ("error" in resolved) return resolved;
  const { memberId } = resolved;

  const service = createServiceClient();

  // Eligible = active, not secret, has a rule, not already earned, not already
  // tracked. The last of those is what makes a double-tap on the picker return a
  // sentence instead of a unique-constraint violation.
  const eligible = await getTrackableBadges();
  if (!eligible.some((b) => b.id === target)) return { error: t("badgeNotTrackable") };

  const { data: existing, error: existingError } = await service
    .from("member_tracked_badges")
    .select("slot")
    .eq("member_id", memberId);

  if (existingError) {
    console.error("[addOwnTrackedBadge] slot read failed:", existingError.message);
    return { error: t("generic") };
  }

  const taken = new Set((existing ?? []).map((r) => r.slot as number));
  const slot = Array.from({ length: MAX_TRACKED_BADGES }, (_, i) => i + 1).find(
    (n) => !taken.has(n)
  );
  if (slot === undefined) return { error: t("alreadyTrackingMax") };

  const { error } = await service
    .from("member_tracked_badges")
    .insert({ member_id: memberId, badge_id: target, slot });

  if (error) {
    console.error("[addOwnTrackedBadge] insert failed:", error.message);
    // 23505 is unique_violation: either the badge is already tracked or a
    // concurrent add took the slot this call picked. Both mean "no room / already
    // there" from the member's side, and neither is the generic message.
    if (error.code === "23505") return { error: t("alreadyTrackingMax") };
    return { error: t("generic") };
  }

  // The tracker is server-rendered into /portal, so a later navigation there must
  // not serve a cached page still showing the old goals.
  revalidatePath("/portal");

  return { success: true, badgeId: target };
}

/**
 * Removes one badge from the authenticated member's objectives.
 *
 * Scoped by `member_id` resolved from the session, not passed in: the service
 * client bypasses RLS, so an unscoped delete would happily remove another member's
 * goal.
 *
 * Deleting a row that isn't there is a success, not an error. The member's intent —
 * "I am not chasing this" — is satisfied either way, and the case that produces it
 * is a double-tap or a stale card, neither of which is worth an error message.
 */
export async function removeOwnTrackedBadge(
  badgeId: number
): Promise<{ success: true; badgeId: number } | { error: string }> {
  const t = await errors();
  const parsed = trackedBadgeSchema.safeParse({ badge_id: badgeId });
  if (!parsed.success) return { error: t("generic") };
  const target = parsed.data.badge_id;

  const resolved = await resolveOwnMemberIdForTracker(t);
  if ("error" in resolved) return resolved;

  const { error } = await createServiceClient()
    .from("member_tracked_badges")
    .delete()
    .eq("member_id", resolved.memberId)
    .eq("badge_id", target);

  if (error) {
    console.error("[removeOwnTrackedBadge] delete failed:", error.message);
    return { error: t("generic") };
  }

  revalidatePath("/portal");

  return { success: true, badgeId: target };
}
