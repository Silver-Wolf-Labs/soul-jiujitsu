"use server";

/**
 * Membership plan + member-membership admin actions.
 *
 * There is no payment processor in this system: the profe collects payment in
 * person at the gym, and these actions are the record of who is on which plan.
 * `price_cents` is therefore a *display and bookkeeping* figure — writing it
 * never moves money. See src/lib/currency.ts for how it is rendered (colones).
 */

import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireOwner } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";

type PlanPayload = {
  name: string;
  description?: string | null;
  price_cents: number;
  billing_interval: "month" | "year" | "one_time";
  trial_days?: number;
  max_classes_per_week?: number | null;
  // Display (landing page)
  features?: string[];
  highlight?: boolean;
  highlight_color?: string | null;
  highlight_label?: string | null;
  period_display?: string | null;
  cta_label?: string;
  cta_href?: string;
  display_order?: number;
  visible?: boolean;
};

export async function createMembershipPlan(data: PlanPayload) {
  await requireAdmin();
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("membership_plans")
    .insert({ ...data, status: "active", features: data.features ?? [] })
    .select("id").single();
  if (error) throw new Error(error.message);

  await logAuditEvent("CREATE", "membership_plans", String(row.id), { ...data });
  revalidatePath("/");
}

export async function updateMembershipPlan(id: number, data: Partial<PlanPayload>) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("membership_plans").select("*").eq("id", id).single();
  const { error } = await supabase.from("membership_plans").update(data).eq("id", id);
  if (error) throw new Error(error.message);

  await logAuditEvent("UPDATE", "membership_plans", String(id), { before, after: data });
  revalidatePath("/");
}

export async function changePlanPrice(
  id: number,
  new_price_cents: number,
  scope: "new_only" | "all_current",
  excluded_member_ids: number[] = []
) {
  await requireAdmin();
  const supabase = createClient();
  const { data: plan } = await supabase
    .from("membership_plans")
    .select("price_cents, billing_interval")
    .eq("id", id)
    .single();
  if (!plan) throw new Error("Plan not found");

  // Update the plan's display price
  const { error: planErr } = await supabase.from("membership_plans").update({ price_cents: new_price_cents }).eq("id", id);
  if (planErr) throw new Error(planErr.message);

  // Log the price change with exclusion list
  const { data: user } = await supabase.auth.getUser();
  await supabase.from("plan_price_history").insert({
    plan_id: id,
    old_price_cents: plan.price_cents,
    new_price_cents,
    scope,
    changed_by: user.user?.id ?? null,
    excluded_member_ids,
  });

  // Bulk-update locked_price_cents for all current subscribers, skipping exclusions
  if (scope === "all_current") {
    let query = supabase
      .from("member_memberships")
      .update({ locked_price_cents: new_price_cents })
      .eq("plan_id", id)
      .in("status", ["active", "trialing", "paused"]);

    if (excluded_member_ids.length > 0) {
      query = query.not("member_id", "in", `(${excluded_member_ids.join(",")})`);
    }

    const { error: bulkErr } = await query;
    if (bulkErr) throw new Error(bulkErr.message);
  }

  await logAuditEvent("UPDATE", "membership_plans", String(id), {
    before: { price_cents: plan.price_cents },
    after: { price_cents: new_price_cents },
    scope,
    excluded_member_ids,
  });
}

/** Owner-only — affects revenue recognition + member-facing pricing. */
export async function archiveMembershipPlan(id: number) {
  await requireOwner();
  const supabase = createClient();
  const { data: before } = await supabase.from("membership_plans").select("*").eq("id", id).single();
  const { error } = await supabase.from("membership_plans").update({ status: "archived" }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "membership_plans", String(id), { before, after: { status: "archived" } });
  revalidatePath("/");
}

export async function reorderMembershipPlan(id: number, direction: "up" | "down", currentOrder: number) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase.from("membership_plans").select("id").eq("display_order", targetOrder).maybeSingle();
  if (sibling) {
    await supabase.from("membership_plans").update({ display_order: currentOrder }).eq("id", sibling.id);
  }
  await supabase.from("membership_plans").update({ display_order: targetOrder }).eq("id", id);
  revalidatePath("/");
}

export async function restoreMembershipPlan(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase.from("membership_plans").update({ status: "active" }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "membership_plans", String(id), { after: { status: "active" } });
  revalidatePath("/");
}

// ── Member membership assignment ──────────────────────────────────────────────

/**
 * Admin plan assignment. Always writes the membership row directly — there is
 * no online checkout to route through, since the profe collects payment in
 * person.
 *
 * - is_comp = true: complimentary membership (instructor comps, staff,
 *   make-goods). Locked price is forced to 0.
 * - is_comp = false: the plan's price is locked onto the membership as the
 *   amount the member owes the gym. Collecting it is an in-person, off-system
 *   act; the row records the arrangement, not a payment.
 */
export async function assignMembership(data: {
  member_id: number;
  plan_id: number;
  started_at?: string;
  ends_at?: string;
  is_comp?: boolean;
}): Promise<{ assigned: true }> {
  await requireAdmin();
  const supabase = createClient();
  const { data: plan } = await supabase
    .from("membership_plans")
    .select("price_cents, name, billing_interval")
    .eq("id", data.plan_id)
    .single();
  if (!plan) throw new Error("Plan not found");

  if (plan.billing_interval === "one_time") {
    throw new Error("One-time plans cannot be assigned as memberships. Use createPurchase instead.");
  }

  const lockedPrice = data.is_comp ? 0 : plan.price_cents;
  const { data: row, error } = await supabase
    .from("member_memberships")
    .insert({
      member_id: data.member_id,
      plan_id: data.plan_id,
      started_at: data.started_at,
      ends_at: data.ends_at,
      status: "active",
      locked_price_cents: lockedPrice,
      plan_name: plan.name,
      plan_billing_interval: plan.billing_interval,
      is_comp: !!data.is_comp,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "member_memberships", String(row.id), {
    ...data,
    locked_price_cents: lockedPrice,
    plan_name: plan.name,
    is_comp: !!data.is_comp,
    source: data.is_comp
      ? "admin_assignment_comp"
      : "admin_assignment_manual_billing",
  });
  return { assigned: true };
}

export async function setMembershipOverridePrice(id: number, override_price_cents: number | null, override_note: string) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("member_memberships").select("*").eq("id", id).single();
  const { error } = await supabase.from("member_memberships")
    .update({ override_price_cents, override_note: override_note || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "member_memberships", String(id), {
    before: { override_price_cents: before?.override_price_cents },
    after: { override_price_cents, override_note },
  });
}

export async function forceSetMembershipStatus(
  id: number,
  status: "active" | "trialing" | "paused" | "past_due" | "canceled",
  note: string,
  paused_until?: string | null
) {
  await requireAdmin();
  if (!note.trim()) throw new Error("A note is required when forcing membership status.");
  const supabase = createClient();
  const { data: before } = await supabase
    .from("member_memberships")
    .select("status, is_comp")
    .eq("id", id)
    .single();

  const updates: Record<string, unknown> = { status };
  if (status === "canceled") updates.canceled_at = new Date().toISOString();
  if (status === "paused") {
    updates.paused_until = paused_until ?? null;
  } else {
    updates.paused_until = null; // clear when leaving paused state
  }

  const { error } = await supabase.from("member_memberships").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "member_memberships", String(id), {
    before: { status: before?.status },
    after: { status, paused_until: updates.paused_until ?? null },
    admin_note: note,
    forced: true,
  });
}

/**
 * `mode` is retained in the audit trail but no longer changes what is written:
 * with no subscription to wind down, cancelling is always effective now. It
 * still records whether the admin *intended* an immediate cut-off or an
 * end-of-period one, which is the part the profe may need to honour in person.
 */
export async function cancelMembership(
  id: number,
  mode: "immediate" | "end_of_period" = "end_of_period"
) {
  await requireAdmin();
  const supabase = createClient();

  const updates: Record<string, unknown> = {
    status: "canceled",
    canceled_at: new Date().toISOString(),
    paused_until: null,
  };

  const { error } = await supabase.from("member_memberships").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "member_memberships", String(id), {
    after: { status: "canceled", mode },
  });
}

// ── One-time purchases (drop-ins) ─────────────────────────────────────────────

export async function createPurchase(data: {
  member_id: number;
  plan_id: number;
  notes?: string;
}) {
  await requireAdmin();
  const supabase = createClient();
  const { data: plan } = await supabase
    .from("membership_plans")
    .select("price_cents, name, billing_interval")
    .eq("id", data.plan_id)
    .single();
  if (!plan) throw new Error("Plan not found");
  if (plan.billing_interval !== "one_time") {
    throw new Error("createPurchase is only for one-time plans. Use assignMembership for recurring plans.");
  }

  const { data: row, error } = await supabase
    .from("member_purchases")
    .insert({
      member_id: data.member_id,
      plan_id: data.plan_id,
      plan_name: plan.name,
      plan_billing_interval: plan.billing_interval,
      price_cents: plan.price_cents,
      notes: data.notes ?? null,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "member_purchases", String(row.id), {
    ...data,
    price_cents: plan.price_cents,
    plan_name: plan.name,
  });
}
