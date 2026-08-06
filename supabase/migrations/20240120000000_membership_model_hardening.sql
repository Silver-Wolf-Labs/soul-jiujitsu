-- ─────────────────────────────────────────────────────────────────────────────
-- Membership model hardening (principal engineer feedback)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Generated effective_price_cents — single canonical price field
--    COALESCE(override_price_cents, locked_price_cents)
--    Prevents drift across multiple consumers (UI, Stripe sync, analytics)
ALTER TABLE member_memberships
  ADD COLUMN IF NOT EXISTS effective_price_cents INT
    GENERATED ALWAYS AS (COALESCE(override_price_cents, locked_price_cents)) STORED;

-- 2. Pause metadata — resume date for scheduled auto-resume (cron)
ALTER TABLE member_memberships
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ NULL;

-- 3. Plan field snapshots — preserve name + interval at assignment time
--    so historical records remain accurate even if plan metadata changes later
ALTER TABLE member_memberships
  ADD COLUMN IF NOT EXISTS plan_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS plan_billing_interval TEXT NULL;

-- 4. Enforce one active membership per member at the DB level
--    "active | trialing | paused | past_due" are all live billing states
CREATE UNIQUE INDEX IF NOT EXISTS member_memberships_one_active
  ON member_memberships (member_id)
  WHERE status IN ('active', 'trialing', 'paused', 'past_due');

-- 5. Per-operation bulk price exclusions
--    Stored on the price-change history row so exceptions are explicit and
--    auditable without persistent per-member flags
ALTER TABLE plan_price_history
  ADD COLUMN IF NOT EXISTS excluded_member_ids INT[] NOT NULL DEFAULT '{}';

-- 6. member_purchases — separate operational table for one-time transactions
--    Drop-ins have different lifecycle semantics than subscriptions; they don't
--    belong in member_memberships (no status machine, no recurring billing)
CREATE TABLE IF NOT EXISTS member_purchases (
  id                   BIGSERIAL PRIMARY KEY,
  member_id            INT          NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id              INT          NOT NULL REFERENCES membership_plans(id),
  plan_name            TEXT         NOT NULL,           -- snapshot at purchase time
  plan_billing_interval TEXT        NOT NULL DEFAULT 'one_time',
  price_cents          INT          NOT NULL,
  purchased_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  notes                TEXT         NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE member_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on member_purchases"
  ON member_purchases FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

CREATE POLICY "Member reads own purchases"
  ON member_purchases FOR SELECT TO authenticated
  USING (member_id = (
    SELECT id FROM members WHERE user_id = auth.uid() LIMIT 1
  ));
