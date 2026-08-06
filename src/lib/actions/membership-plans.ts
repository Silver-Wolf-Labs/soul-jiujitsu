"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireOwner } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import {
  getStripe,
  findOrCreateStripeCustomer,
  findOrCreateStripePrice,
  createCheckoutSession,
  ensureStripeProduct,
  isStripeConfigured,
} from "@/lib/stripe";

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

  // Auto-create Stripe Product + Price — errors propagate so admin can retry
  const { productId, priceId } = await ensureStripeProduct({
    id: row.id,
    name: data.name,
    description: data.description,
    price_cents: data.price_cents,
    billing_interval: data.billing_interval,
  });
  await supabase.from("membership_plans").update({
    stripe_product_id: productId,
    stripe_default_price_id: priceId,
  }).eq("id", row.id);

  await logAuditEvent("CREATE", "membership_plans", String(row.id), { ...data });
  revalidatePath("/");
}

export async function updateMembershipPlan(id: number, data: Partial<PlanPayload>) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("membership_plans").select("*").eq("id", id).single();
  const { error } = await supabase.from("membership_plans").update(data).eq("id", id);
  if (error) throw new Error(error.message);

  // Sync name change to Stripe (best-effort — don't block local update)
  if (data.name && before?.stripe_product_id) {
    try {
      const stripe = getStripe();
      await stripe.products.update(before.stripe_product_id, { name: data.name });
    } catch (err) {
      console.error("[updateMembershipPlan] Stripe product name sync failed:", err);
    }
  }

  // If plan lacks Stripe IDs (previous creation failed), try again with fresh data
  if (!before?.stripe_product_id) {
    const { data: fresh } = await supabase.from("membership_plans")
      .select("name, description, price_cents, billing_interval")
      .eq("id", id).single();
    if (fresh) {
      const { productId, priceId } = await ensureStripeProduct({ id, ...fresh });
      await supabase.from("membership_plans").update({
        stripe_product_id: productId,
        stripe_default_price_id: priceId,
      }).eq("id", id);
    }
  }

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
    .select("price_cents, billing_interval, stripe_product_id")
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

  // Create new Stripe Price and update plan default
  let newStripePriceId: string | null = null;
  if (plan.stripe_product_id && plan.billing_interval !== "one_time") {
    newStripePriceId = await findOrCreateStripePrice(
      plan.stripe_product_id,
      new_price_cents,
      plan.billing_interval as "month" | "year"
    );
    await supabase
      .from("membership_plans")
      .update({ stripe_default_price_id: newStripePriceId })
      .eq("id", id);
  }

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

    // Propagate price change to existing Stripe subscriptions
    if (newStripePriceId) {
      const { data: memberships } = await supabase
        .from("member_memberships")
        .select("id, member_id, stripe_subscription_id")
        .eq("plan_id", id)
        .in("status", ["active", "trialing", "paused"])
        .not("stripe_subscription_id", "is", null);

      const stripe = getStripe();
      const failures: number[] = [];

      for (const ms of memberships ?? []) {
        if (excluded_member_ids.includes(ms.member_id)) continue;
        try {
          const sub = await stripe.subscriptions.retrieve(ms.stripe_subscription_id!);
          const itemId = sub.items.data[0]?.id;
          if (itemId) {
            await stripe.subscriptions.update(ms.stripe_subscription_id!, {
              items: [{ id: itemId, price: newStripePriceId }],
              proration_behavior: "none",
            });
            await supabase
              .from("member_memberships")
              .update({ stripe_price_id: newStripePriceId })
              .eq("id", ms.id);
          }
        } catch (err) {
          console.error(`[changePlanPrice] Failed to update subscription for membership ${ms.id}:`, err);
          failures.push(ms.id);
        }
      }

      if (failures.length > 0) {
        console.warn(`[changePlanPrice] Price update failed for ${failures.length} subscriptions: ${failures.join(", ")}`);
      }
    }
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
 * Admin plan assignment.
 * - is_comp = true: Free membership (instructor comps, staff, etc). No Stripe.
 * - is_comp = false: Creates a Stripe Checkout link for the member to pay.
 *   Returns the checkout URL so the admin can share it.
 */
export async function assignMembership(data: {
  member_id: number;
  plan_id: number;
  started_at?: string;
  ends_at?: string;
  is_comp?: boolean;
}): Promise<{ checkoutUrl?: string; assigned?: boolean }> {
  await requireAdmin();
  const supabase = createClient();
  const { data: plan } = await supabase
    .from("membership_plans")
    .select("price_cents, name, billing_interval, stripe_product_id, stripe_default_price_id")
    .eq("id", data.plan_id)
    .single();
  if (!plan) throw new Error("Plan not found");

  if (plan.billing_interval === "one_time") {
    throw new Error("One-time plans cannot be assigned as memberships. Use createPurchase instead.");
  }

  // Direct-insert branches:
  //   1. Explicit comp (price 0, is_comp flag).
  //   2. Stripe not configured at all (env var missing) — the gym is
  //      running without online payments, admins bill members out-of-band.
  //   3. Plan hasn't been synced to Stripe (no product/price ids) — same
  //      story; the plan exists in the DB but has no hosted-checkout path.
  //
  // All three write the membership row directly with the appropriate
  // locked price. Only the explicit comp branch zeroes the price.
  const stripeReady =
    isStripeConfigured()
    && !!plan.stripe_product_id
    && !!plan.stripe_default_price_id;

  if (data.is_comp || !stripeReady) {
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

  // Paid membership via Stripe Checkout (Stripe is configured AND the
  // plan has Stripe IDs). Return a checkout URL the admin can hand to
  // the member to complete payment.
  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("id", data.member_id)
    .single();
  if (!member) throw new Error("Member not found");

  const customerId = await findOrCreateStripeCustomer(
    member.id,
    member.email,
    `${member.first_name} ${member.last_name}`
  );

  const checkoutUrl = await createCheckoutSession({
    memberId: member.id,
    planId: data.plan_id,
    customerId,
    mode: "subscription",
    priceId: plan.stripe_default_price_id,
  });

  await logAuditEvent("CREATE", "member_memberships", "pending", {
    ...data,
    locked_price_cents: plan.price_cents,
    plan_name: plan.name,
    source: "admin_assignment_checkout",
  });

  return { checkoutUrl };
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
    .select("status, stripe_subscription_id, is_comp")
    .eq("id", id)
    .single();

  const updates: Record<string, unknown> = { status };
  if (status === "canceled") updates.canceled_at = new Date().toISOString();
  if (status === "paused") {
    updates.paused_until = paused_until ?? null;
  } else {
    updates.paused_until = null; // clear when leaving paused state
  }

  // Sync status changes to Stripe for paid memberships
  if (before?.stripe_subscription_id && !before.is_comp) {
    try {
      const stripe = getStripe();
      const subId = before.stripe_subscription_id;

      if (status === "paused") {
        await stripe.subscriptions.update(subId, {
          pause_collection: { behavior: "void" },
        });
      } else if (status === "canceled") {
        await stripe.subscriptions.cancel(subId);
      } else if (String(before.status) === "paused") {
        // Resume from pause
        await stripe.subscriptions.update(subId, {
          pause_collection: "",
        });
      }
    } catch (err) {
      console.error("[forceSetMembershipStatus] Stripe sync failed:", err);
      // Continue with local update
    }
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

export async function cancelMembership(
  id: number,
  mode: "immediate" | "end_of_period" = "end_of_period"
) {
  await requireAdmin();
  const supabase = createClient();

  // Get current membership to check for Stripe subscription
  const { data: membership } = await supabase
    .from("member_memberships")
    .select("stripe_subscription_id, is_comp")
    .eq("id", id)
    .single();

  // Cancel in Stripe if applicable
  if (membership?.stripe_subscription_id && !membership.is_comp) {
    try {
      const stripe = getStripe();
      if (mode === "immediate") {
        await stripe.subscriptions.cancel(membership.stripe_subscription_id);
      } else {
        await stripe.subscriptions.update(membership.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      }
    } catch (err) {
      console.error("[cancelMembership] Stripe cancellation failed:", err);
      // Continue with local cancellation — webhook will eventually sync
    }
  }

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
