-- ============================================================================
-- Stripe Integration: Add columns for linking local records to Stripe objects
-- ============================================================================

-- 1. Link members to Stripe Customers
ALTER TABLE members
  ADD COLUMN stripe_customer_id TEXT UNIQUE;

CREATE INDEX idx_members_stripe_customer ON members(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- 2. Link memberships to Stripe Subscriptions
ALTER TABLE member_memberships
  ADD COLUMN stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN stripe_price_id TEXT,
  ADD COLUMN current_period_end TIMESTAMPTZ,
  ADD COLUMN is_comp BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_memberships_stripe_sub ON member_memberships(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- 3. Link plans to Stripe Products/Prices
ALTER TABLE membership_plans
  ADD COLUMN stripe_product_id TEXT,
  ADD COLUMN stripe_default_price_id TEXT;

-- 4. Link one-time purchases to Stripe
ALTER TABLE member_purchases
  ADD COLUMN stripe_payment_intent_id TEXT UNIQUE,
  ADD COLUMN stripe_checkout_session_id TEXT;

-- 5. Idempotency log for webhook events
--    status column enables crash-safe processing: events are 'pending' on insert,
--    'processed' on success. Only 'processed' events are skipped on retry.
--    If the process crashes between insert and completion, the pending record
--    is found on retry and reprocessed (not skipped).
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,                    -- Stripe event ID (evt_...)
  type TEXT NOT NULL,                     -- e.g. 'checkout.session.completed'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  payload JSONB                           -- Full event object for debugging
);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies = only service role can access
