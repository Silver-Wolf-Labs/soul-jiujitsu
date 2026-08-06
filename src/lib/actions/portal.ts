"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@/lib/audit";
import { gymToday } from "@/lib/gym-time";
import type { KioskMemberStats, GymRankings } from "@/lib/actions/check-ins";
import type { CheckInRow, BeltHistory } from "@/lib/supabase/types";
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
