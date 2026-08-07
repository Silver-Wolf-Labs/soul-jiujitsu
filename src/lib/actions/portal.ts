"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@/lib/audit";
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
import { findOrCreateStripeCustomer, createCheckoutSession } from "@/lib/stripe";

export async function updateOwnProfile(data: {
  first_name: string;
  last_name: string;
  phone: string;
  birth_month?: number | null;
  birth_year?: number | null;
  gender?: string | null;
}): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: "Not authenticated" };

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

  if (error) return { error: error.message };
  return { success: true };
}

export async function updateOwnEmergencyContact(data: {
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("members")
    .update({
      emergency_contact_name: data.emergency_contact_name || null,
      emergency_contact_phone: data.emergency_contact_phone || null,
      emergency_contact_relationship: data.emergency_contact_relationship || null,
    })
    .eq("user_id", userData.user.id);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Self-enrollment flow:
 * - Plans with trial_days > 0: Create membership locally (no card, no Stripe).
 *   Returns { success: true }.
 * - Plans with no trial: Redirect to Stripe Checkout for payment.
 *   Returns { checkoutUrl: string }.
 */
export async function selfEnrollInPlan(
  plan_id: number
): Promise<{ success: true } | { checkoutUrl: string } | { error: string }> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: "Not authenticated" };

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("user_id", userData.user.id)
    .single();
  if (!member) return { error: "Member record not found" };

  // Guard: no existing active/paused/trialing membership
  const { data: existing } = await supabase
    .from("member_memberships")
    .select("id")
    .eq("member_id", member.id)
    .in("status", ["active", "trialing", "paused", "past_due"])
    .limit(1)
    .maybeSingle();
  if (existing) return { error: "You already have an active membership" };

  const { data: plan } = await supabase
    .from("membership_plans")
    .select("price_cents, name, billing_interval, status, visible, trial_days, stripe_product_id, stripe_default_price_id")
    .eq("id", plan_id)
    .single();
  if (!plan) return { error: "Plan not found" };
  if (plan.status !== "active" || !plan.visible) return { error: "Plan is not available" };
  if (plan.billing_interval === "one_time") return { error: "Drop-in plans cannot be enrolled as memberships" };

  const adminSupabase = createServiceClient();

  // ── Trial path: no card, no commitment ──────────────────────────────────
  if (plan.trial_days > 0) {
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
    if (rpcError) return { error: rpcError.message };
    if (rpcData?.error === "already_enrolled") {
      return { error: "You already have an active membership" };
    }
    if (rpcData?.error) return { error: rpcData.error };

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

  // ── Paid path: redirect to Stripe Checkout ──────────────────────────────
  if (!plan.stripe_product_id || !plan.stripe_default_price_id) {
    return { error: "This plan is not yet configured for payments. Please contact the gym." };
  }

  try {
    const customerId = await findOrCreateStripeCustomer(
      member.id,
      member.email,
      `${member.first_name} ${member.last_name}`
    );

    const checkoutUrl = await createCheckoutSession({
      memberId: member.id,
      planId: plan_id,
      customerId,
      mode: "subscription",
      priceId: plan.stripe_default_price_id,
    });

    return { checkoutUrl };
  } catch (err) {
    console.error("[selfEnrollInPlan] Stripe checkout creation failed:", err);
    return { error: "Payment service unavailable. Please try again." };
  }
}

// NOTE: belt, stripes, and belt_awarded_at are managed by admins only.
// Members can only record when they personally started training BJJ.
export async function updateOwnTrainingInfo(data: {
  training_started_at: string | null;
}): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("members")
    .update({
      training_started_at: data.training_started_at || null,
    })
    .eq("user_id", userData.user.id);

  if (error) return { error: error.message };
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
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: "Not authenticated" };

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userData.user.id)
    .single();
  if (!member) return { error: "Member record not found" };

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
  if (readErr) return { error: readErr.message };
  if (!row) return { error: "Check-in not found" };
  if (row.member_id !== member.id) return { error: "Not your check-in" };

  // Gym-local "today" — uses the same clock as the kiosk so late-night undo
  // and late-night check-in agree on the date boundary.
  const today = await gymToday();
  if (row.class_date !== today) {
    return { error: "Only today's check-ins can be undone." };
  }

  const { error } = await adminSupabase
    .from("check_ins")
    .delete()
    .eq("id", checkInId);
  if (error) return { error: error.message };

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
 * Resolves the authenticated user's member record.
 * Throws if the session is missing or the user has no linked member row.
 */
async function resolveOwnMember(): Promise<{ id: number }> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Not authenticated");

  const { data: member, error } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) throw new Error("Member record not found");
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
 * Returns the badge catalogue plus which of them the member has earned.
 *
 * Unearned badges are returned too: showing them as locked silhouettes is the
 * whole point — they're the goals. Secret badges are filtered out unless the
 * member already has them, so a surprise stays a surprise.
 */
export async function getOwnBadges(): Promise<{ earned: EarnedBadge[]; locked: Badge[] }> {
  const member = await resolveOwnMember();
  const service = createServiceClient();

  const BADGE_FIELDS = "id, slug, name, description, icon, tier, category, xp_reward, secret, active, sort_order";

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
  let member: { id: number };
  try {
    member = await resolveOwnMember();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authenticated" };
  }

  const service = createServiceClient();
  const pgDay = await gymPgDay();

  const { data: slot, error: slotError } = await service
    .from("schedule_slots")
    .select("id, title, day_of_week, active")
    .eq("id", scheduleSlotId)
    .maybeSingle();

  if (slotError) return { error: slotError.message };
  if (!slot || !slot.active) return { error: "That class is not on the schedule." };
  // A slot from another weekday means a stale page — the member left the portal
  // open past midnight. Say so rather than silently recording the wrong day.
  if (slot.day_of_week !== pgDay) {
    return { error: "That class isn't scheduled today. Please refresh." };
  }

  const result = await writeCheckIn(service, {
    memberId: member.id,
    className: slot.title as string,
    scheduleSlotId: slot.id as number,
    source: "portal",
  });
  if (!result.ok) return { error: result.error ?? "Check-in failed" };

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
