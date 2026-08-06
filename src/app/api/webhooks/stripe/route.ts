import { NextRequest, NextResponse } from "next/server";
import {
  getStripe,
  getPeriodEndIso,
  getSubscriptionIdFromInvoice,
  syncMemberStatus,
} from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

type SupabaseAdmin = ReturnType<typeof createServiceClient>;

/**
 * Stripe Webhook Handler
 *
 * Processes payment events and syncs Stripe state → local DB.
 * This is the ONLY place where payment-triggered DB writes happen.
 *
 * Security: Signature verified via stripe.webhooks.constructEvent().
 * Auth: Endpoint is excluded from middleware auth (unauthenticated inbound POST).
 * Idempotency: stripe_events table with status column prevents duplicate processing
 *   while remaining crash-safe (pending events are reprocessed on retry).
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  const supabase = createServiceClient();

  // 1. Read raw body — DO NOT use request.json() (breaks signature verification)
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // 2. Verify webhook signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 3. Idempotency: only skip events that were fully processed
  const { data: existing } = await supabase
    .from("stripe_events")
    .select("id, status")
    .eq("id", event.id)
    .single();

  if (existing?.status === "processed") {
    return NextResponse.json({ status: "already_processed" }, { status: 200 });
  }

  // 4. Upsert event as pending (handles both new events and crash-retry of pending ones)
  if (!existing) {
    await supabase.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      status: "pending",
      payload: event.data as unknown as Record<string, unknown>,
    });
  }

  // 5. Route by event type
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // Both handled identically — updated fires first with the new status,
        // deleted fires when the period actually ends. Same sync logic applies.
        await handleSubscriptionChanged(supabase, event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(supabase, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(supabase, event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    // 6. Mark as processed
    await supabase
      .from("stripe_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", event.id);

    return NextResponse.json({ status: "processed" }, { status: 200 });
  } catch (err) {
    // Return 500 so Stripe retries. The event stays 'pending' so it will be reprocessed.
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

// ── Event Handlers ───────────────────────────────────────────────────────────

/**
 * checkout.session.completed
 *
 * Fired when a member completes Stripe Checkout.
 * Creates the membership or purchase row in the DB.
 */
async function handleCheckoutCompleted(
  supabase: SupabaseAdmin,
  session: Stripe.Checkout.Session
) {
  const memberId = Number(session.metadata?.member_id);
  const planId = Number(session.metadata?.plan_id);
  const isDropIn = session.metadata?.type === "drop_in";

  if (!memberId || !planId) {
    console.error("[stripe-webhook] checkout missing metadata:", session.metadata);
    return;
  }

  // Ensure stripe_customer_id is stored
  if (session.customer) {
    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer.id;
    await supabase
      .from("members")
      .update({ stripe_customer_id: customerId })
      .eq("id", memberId);
  }

  if (isDropIn) {
    await handleDropInCheckout(supabase, session, memberId, planId);
  } else {
    await handleSubscriptionCheckout(supabase, session, memberId, planId);
  }

  await syncMemberStatus(memberId);

  console.log(
    `[stripe-webhook] checkout.completed: member=${memberId} plan=${planId} type=${isDropIn ? "drop_in" : "subscription"}`
  );
}

async function handleDropInCheckout(
  supabase: SupabaseAdmin,
  session: Stripe.Checkout.Session,
  memberId: number,
  planId: number
) {
  const { data: plan } = await supabase
    .from("membership_plans")
    .select("name, billing_interval, price_cents")
    .eq("id", planId)
    .single();

  await supabase.from("member_purchases").insert({
    member_id: memberId,
    plan_id: planId,
    plan_name: plan?.name ?? "Unknown",
    plan_billing_interval: plan?.billing_interval ?? "one_time",
    price_cents: session.amount_total ?? plan?.price_cents ?? 0,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
  });
}

async function handleSubscriptionCheckout(
  supabase: SupabaseAdmin,
  session: Stripe.Checkout.Session,
  memberId: number,
  planId: number
) {
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.error("[stripe-webhook] checkout: no subscription ID");
    return;
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  const amountCents = item?.price?.unit_amount ?? 0;
  const periodEndIso = getPeriodEndIso(subscription);
  const status = subscription.status === "trialing" ? "trialing" : "active";

  const { data: plan } = await supabase
    .from("membership_plans")
    .select("name, billing_interval")
    .eq("id", planId)
    .single();

  // Check if there's an existing trialing membership to upgrade
  const { data: existingTrial } = await supabase
    .from("member_memberships")
    .select("id")
    .eq("member_id", memberId)
    .eq("plan_id", planId)
    .eq("status", "trialing")
    .maybeSingle();

  if (existingTrial) {
    await supabase
      .from("member_memberships")
      .update({
        status,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        current_period_end: periodEndIso,
        locked_price_cents: amountCents,
      })
      .eq("id", existingTrial.id);
  } else {
    await supabase.from("member_memberships").insert({
      member_id: memberId,
      plan_id: planId,
      status,
      started_at: new Date().toISOString(),
      locked_price_cents: amountCents,
      plan_name: plan?.name ?? "Unknown",
      plan_billing_interval: plan?.billing_interval ?? "month",
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      current_period_end: periodEndIso,
    });
  }
}

/**
 * customer.subscription.updated + customer.subscription.deleted
 *
 * Unified handler: syncs subscription status, period end, price, and cancel dates.
 * The deleted event is just the final status transition — same logic applies.
 */
async function handleSubscriptionChanged(
  supabase: SupabaseAdmin,
  subscription: Stripe.Subscription
) {
  const { data: membership } = await supabase
    .from("member_memberships")
    .select("id, member_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!membership) {
    console.warn(`[stripe-webhook] subscription.changed: no local membership for ${subscription.id}`);
    return;
  }

  // Map Stripe status → local status
  const statusMap: Record<string, string> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    paused: "paused",
  };

  const newStatus = statusMap[subscription.status] ?? "active";
  const periodEndIso = getPeriodEndIso(subscription);

  const updates: Record<string, unknown> = {
    status: newStatus,
    current_period_end: periodEndIso,
    stripe_price_id: subscription.items.data[0]?.price?.id ?? null,
  };

  if (subscription.cancel_at) {
    updates.ends_at = new Date(subscription.cancel_at * 1000).toISOString();
  } else if (subscription.cancel_at_period_end && periodEndIso) {
    updates.ends_at = periodEndIso;
  } else {
    updates.ends_at = null; // Cancellation was reversed
  }

  if (newStatus === "canceled") {
    updates.canceled_at = new Date().toISOString();
  }

  await supabase.from("member_memberships").update(updates).eq("id", membership.id);
  await syncMemberStatus(membership.member_id);

  console.log(`[stripe-webhook] subscription.changed: membership=${membership.id} status=${newStatus}`);
}

/**
 * invoice.payment_failed — sets membership to past_due.
 */
async function handlePaymentFailed(supabase: SupabaseAdmin, invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  const { data: membership } = await supabase
    .from("member_memberships")
    .select("id, member_id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();
  if (!membership) return;

  await supabase
    .from("member_memberships")
    .update({ status: "past_due" })
    .eq("id", membership.id);

  // past_due doesn't change member status (still considered active)
  console.log(`[stripe-webhook] invoice.payment_failed: membership=${membership.id}`);
}

/**
 * invoice.payment_succeeded — updates period end, restores past_due → active.
 * Uses invoice.period_end directly instead of an extra Stripe API call.
 */
async function handlePaymentSucceeded(supabase: SupabaseAdmin, invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  const { data: membership } = await supabase
    .from("member_memberships")
    .select("id, member_id, status")
    .eq("stripe_subscription_id", subscriptionId)
    .single();
  if (!membership) return;

  const updates: Record<string, unknown> = {
    current_period_end: new Date(invoice.period_end * 1000).toISOString(),
  };

  if (membership.status === "past_due") {
    updates.status = "active";
    await syncMemberStatus(membership.member_id);
  }

  await supabase.from("member_memberships").update(updates).eq("id", membership.id);
  console.log(`[stripe-webhook] invoice.payment_succeeded: membership=${membership.id}`);
}
