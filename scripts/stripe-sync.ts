/**
 * One-time setup script: Sync existing membership plans to Stripe Products/Prices.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/stripe-sync.ts
 *
 * Prerequisites:
 *   - STRIPE_SECRET_KEY set in .env.local
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in .env.local
 *   - stripe npm package installed
 *
 * This script is idempotent: re-running it will skip plans that already have
 * stripe_product_id set.
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("Fetching active membership plans...\n");

  const { data: plans, error } = await supabase
    .from("membership_plans")
    .select("*")
    .eq("status", "active");

  if (error) {
    console.error("Failed to fetch plans:", error.message);
    process.exit(1);
  }

  if (!plans || plans.length === 0) {
    console.log("No active plans found.");
    return;
  }

  for (const plan of plans) {
    // Skip already-synced plans
    if (plan.stripe_product_id) {
      console.log(`  Already synced: ${plan.name} (${plan.stripe_product_id})`);
      continue;
    }

    console.log(`Syncing: ${plan.name} ($${(plan.price_cents / 100).toFixed(2)}/${plan.billing_interval})...`);

    // Create Stripe Product
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description || undefined,
      metadata: { plan_id: String(plan.id) },
    });

    const updates: Record<string, string> = {
      stripe_product_id: product.id,
    };

    if (plan.billing_interval !== "one_time") {
      // Create default recurring Price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_cents,
        currency: "usd",
        recurring: {
          interval: plan.billing_interval as "month" | "year",
        },
      });
      updates.stripe_default_price_id = price.id;
      console.log(`  Product: ${product.id}`);
      console.log(`  Price:   ${price.id}`);
    } else {
      // One-time product — price created per checkout session
      console.log(`  Product: ${product.id} (one-time, no default price)`);
    }

    // Update local DB
    const { error: updateError } = await supabase
      .from("membership_plans")
      .update(updates)
      .eq("id", plan.id);

    if (updateError) {
      console.error(`  Failed to update DB: ${updateError.message}`);
    } else {
      console.log(`  Synced successfully\n`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
