import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Stripe client singleton.
 * Only imported in server-side code — never in client components.
 * API version is pinned to avoid breaking changes on Stripe upgrades.
 */
let stripeInstance: Stripe | null = null;

/** Whether Stripe is configured (keys present in env) */
export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set — add it to your environment variables");
    stripeInstance = new Stripe(key, {
      apiVersion: "2026-03-25.dahlia",
      typescript: true,
    });
  }
  return stripeInstance;
}

// ── Business policy constants ────────────────────────────────────────────────

/** Cancellation notice period in days */
export const CANCELLATION_NOTICE_DAYS = 10;

/** Max pause duration in days */
export const MAX_PAUSE_DAYS = 30;

/** ISO 4217 currency code — defaults to "usd", override via env for international gyms */
export const CURRENCY = (process.env.STRIPE_CURRENCY ?? "usd").toLowerCase();

// ── Stripe v21 helpers ───────────────────────────────────────────────────────
// In the 2026-03-25.dahlia API, current_period_end moved from Subscription
// to SubscriptionItem, and invoice.subscription moved to invoice.parent.

/** Get billing period end from a subscription (lives on the first item in v21) */
export function getPeriodEnd(subscription: Stripe.Subscription): number {
  return subscription.items.data[0]?.current_period_end ?? 0;
}

/** Get period end as ISO string, or null if unavailable */
export function getPeriodEndIso(subscription: Stripe.Subscription): string | null {
  const ts = getPeriodEnd(subscription);
  return ts ? new Date(ts * 1000).toISOString() : null;
}

/** Extract subscription ID from an invoice (v21 parent-based access) */
export function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

// ── Origin URL ───────────────────────────────────────────────────────────────

/** Single source of truth for the app origin used in Stripe redirect URLs */
export function getOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "";
}

// ── Stripe Customer ──────────────────────────────────────────────────────────

/**
 * Find or create a Stripe Customer for a member.
 * Uses the DB unique constraint on stripe_customer_id as a concurrency lock:
 * if two requests race, the second catches the uniqueness violation and re-reads.
 */
export async function findOrCreateStripeCustomer(
  memberId: number,
  email: string,
  name: string
): Promise<string> {
  const supabase = createServiceClient();
  const stripe = getStripe();

  // Check if member already has a Stripe Customer
  const { data: member } = await supabase
    .from("members")
    .select("stripe_customer_id")
    .eq("id", memberId)
    .single();

  if (member?.stripe_customer_id) return member.stripe_customer_id;

  // Check if a Stripe Customer already exists for this email
  const existing = await stripe.customers.list({ email, limit: 1 });
  const customerId = existing.data.length > 0
    ? existing.data[0].id
    : (await stripe.customers.create({ email, name, metadata: { member_id: String(memberId) } })).id;

  // Persist the link — unique constraint catches races
  const { error } = await supabase
    .from("members")
    .update({ stripe_customer_id: customerId })
    .eq("id", memberId);

  if (error?.code === "23505") {
    // Unique violation: another request already set it — re-read
    const { data: fresh } = await supabase
      .from("members")
      .select("stripe_customer_id")
      .eq("id", memberId)
      .single();
    return fresh!.stripe_customer_id!;
  }

  return customerId;
}

// ── Stripe Price ─────────────────────────────────────────────────────────────

/**
 * Find or create a Stripe Price for a given product + amount + interval.
 * Stripe Prices are immutable — we use lookup keys for idempotent matching
 * (avoids pagination issues if a product accumulates many prices over time).
 */
export async function findOrCreateStripePrice(
  productId: string,
  amountCents: number,
  interval: "month" | "year"
): Promise<string> {
  const stripe = getStripe();
  const lookupKey = `plan_${productId}_${amountCents}_${interval}`;

  // Check for existing price with this lookup key
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data.length > 0) return existing.data[0].id;

  // Create with lookup key for future idempotent lookups
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: CURRENCY,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  });
  return price.id;
}

// ── Stripe Product ──────────────────────────────────────────────────────────

/**
 * Ensure a Stripe Product (and default Price) exists for a membership plan.
 * Idempotent: searches by DB ID first, then by Stripe metadata to recover
 * from partial failures (e.g., Product created but DB write failed).
 * Pure Stripe operations — caller is responsible for persisting returned IDs to DB.
 */
export async function ensureStripeProduct(plan: {
  id: number;
  name: string;
  description?: string | null;
  price_cents: number;
  billing_interval: "month" | "year" | "one_time";
  stripe_product_id?: string | null;
}): Promise<{ productId: string; priceId: string | null }> {
  const stripe = getStripe();

  // Check for existing product — by DB ID first, then Stripe metadata
  let productId = plan.stripe_product_id ?? null;
  if (!productId) {
    const existing = await stripe.products.search({
      query: `metadata["plan_id"]:"${plan.id}"`,
    });
    if (existing.data.length > 0) {
      productId = existing.data[0].id;
    }
  }

  // Create if truly new
  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      ...(plan.description && { description: plan.description }),
      metadata: { plan_id: String(plan.id) },
    });
    productId = product.id;
  }

  // For recurring plans, ensure a Price exists
  let priceId: string | null = null;
  if (plan.billing_interval !== "one_time") {
    priceId = await findOrCreateStripePrice(
      productId,
      plan.price_cents,
      plan.billing_interval as "month" | "year"
    );
  }

  return { productId, priceId };
}

// ── Checkout Session ─────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session for subscription or one-time payment.
 * Unified function — mode determines the flow.
 */
export async function createCheckoutSession(params: {
  memberId: number;
  planId: number;
  customerId: string;
  mode: "subscription" | "payment";
  /** Required for subscription mode */
  priceId?: string;
  /** Required for payment mode (inline price) */
  productId?: string;
  amountCents?: number;
}): Promise<string> {
  const stripe = getStripe();
  const origin = getOrigin();

  const metadata = {
    member_id: String(params.memberId),
    plan_id: String(params.planId),
    ...(params.mode === "payment" && { type: "drop_in" }),
  };

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    params.mode === "subscription"
      ? [{ price: params.priceId!, quantity: 1 }]
      : [{
          price_data: {
            currency: CURRENCY,
            unit_amount: params.amountCents!,
            product: params.productId!,
          },
          quantity: 1,
        }];

  const successParam = params.mode === "subscription" ? "enrolled" : "purchased";

  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    line_items: lineItems,
    mode: params.mode,
    metadata,
    ...(params.mode === "subscription" && {
      subscription_data: { metadata },
    }),
    success_url: `${origin}/portal?${successParam}=true`,
    cancel_url: `${origin}/portal?${successParam}=false`,
  });

  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

// ── Member Status Sync ───────────────────────────────────────────────────────

/**
 * Derive the correct member status from their memberships.
 * Single source of truth — called after any membership state change.
 *
 * Priority: active > trial > inactive (based on highest-priority membership)
 */
export async function syncMemberStatus(memberId: number): Promise<void> {
  const supabase = createServiceClient();

  const { data: memberships } = await supabase
    .from("member_memberships")
    .select("status")
    .eq("member_id", memberId)
    .in("status", ["active", "trialing", "paused", "past_due"]);

  let memberStatus: string;
  if (!memberships || memberships.length === 0) {
    memberStatus = "inactive";
  } else {
    const statuses = new Set(memberships.map((m) => m.status));
    if (statuses.has("active") || statuses.has("past_due") || statuses.has("paused")) {
      memberStatus = "active";
    } else if (statuses.has("trialing")) {
      memberStatus = "trial";
    } else {
      memberStatus = "inactive";
    }
  }

  await supabase
    .from("members")
    .update({ status: memberStatus })
    .eq("id", memberId);
}
