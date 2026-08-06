"use server";

/**
 * Authenticated billing server actions.
 *
 * Only functions that require user authentication belong here.
 * Pure Stripe helpers (customer, price, checkout, etc.) live in src/lib/stripe.ts
 * and are NOT exposed as callable server actions.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getOrigin, getPeriodEnd, CANCELLATION_NOTICE_DAYS } from "@/lib/stripe";
import { logAuditEvent } from "@/lib/audit";

// ── Billing Portal ───────────────────────────────────────────────────────────

/**
 * Create a Stripe Billing Portal session for member self-service.
 * Members can update their card, view invoices, and cancel.
 */
export async function createBillingPortalSession(): Promise<
  { url: string } | { error: string }
> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: "Not authenticated" };

  const { data: member } = await supabase
    .from("members")
    .select("stripe_customer_id")
    .eq("user_id", userData.user.id)
    .single();

  if (!member?.stripe_customer_id) {
    return { error: "No billing account found. Please subscribe to a plan first." };
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: member.stripe_customer_id,
      return_url: `${getOrigin()}/portal/profile`,
    });

    return { url: session.url };
  } catch (err) {
    console.error("[createBillingPortalSession] Stripe API error:", err);
    return { error: "Unable to open billing portal. Please try again later." };
  }
}

// ── Cancellation with 10-day notice policy ──────────────────────────────────

/**
 * Cancel a membership with the 10-day notice policy.
 *
 * - If >= 10 days before next billing: cancel at current period end (no extra charge)
 * - If < 10 days before next billing: member gets charged once more,
 *   subscription cancels at the end of the NEXT period
 *
 * No refunds in either case.
 */
export async function requestCancellation(
  membershipId: number
): Promise<{ cancelAt: string; chargedAgain: boolean } | { error: string }> {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: "Not authenticated" };

  // Verify ownership
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userData.user.id)
    .single();
  if (!member) return { error: "Member not found" };

  const adminSupabase = createServiceClient();
  const { data: membership } = await adminSupabase
    .from("member_memberships")
    .select("id, member_id, stripe_subscription_id, is_comp, status")
    .eq("id", membershipId)
    .eq("member_id", member.id)
    .single();

  if (!membership) return { error: "Membership not found" };
  if (membership.status === "canceled") return { error: "Already canceled" };

  // Comp memberships: cancel immediately, no Stripe involved
  if (membership.is_comp || !membership.stripe_subscription_id) {
    await adminSupabase
      .from("member_memberships")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", membershipId);

    await logAuditEvent("UPDATE", "member_memberships", String(membershipId), {
      after: { status: "canceled" },
      source: "self_cancellation",
      is_comp: true,
    });

    return { cancelAt: new Date().toISOString(), chargedAgain: false };
  }

  // Stripe subscription: apply 10-day notice policy
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(
    membership.stripe_subscription_id
  );

  const now = Date.now();
  const periodEndSec = getPeriodEnd(subscription);
  const periodEndMs = periodEndSec * 1000;
  const daysUntilRenewal = (periodEndMs - now) / (1000 * 60 * 60 * 24);

  let cancelAt: Date;
  let chargedAgain = false;

  if (daysUntilRenewal >= CANCELLATION_NOTICE_DAYS) {
    // Enough notice: cancel at current period end
    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    cancelAt = new Date(periodEndMs);
  } else {
    // Not enough notice: charge once more, cancel at end of NEXT period
    const interval = subscription.items.data[0]?.price?.recurring?.interval;
    const nextPeriodEnd = new Date(periodEndMs);
    if (interval === "year") {
      nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
    } else {
      nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
    }

    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      cancel_at: Math.floor(nextPeriodEnd.getTime() / 1000),
    });
    cancelAt = nextPeriodEnd;
    chargedAgain = true;
  }

  // Update local record
  await adminSupabase
    .from("member_memberships")
    .update({ ends_at: cancelAt.toISOString() })
    .eq("id", membershipId);

  await logAuditEvent("UPDATE", "member_memberships", String(membershipId), {
    after: { ends_at: cancelAt.toISOString() },
    source: "self_cancellation",
    days_notice: Math.floor(daysUntilRenewal),
    charged_again: chargedAgain,
  });

  return { cancelAt: cancelAt.toISOString(), chargedAgain };
}
