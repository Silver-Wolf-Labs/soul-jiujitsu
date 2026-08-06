-- Merge pricing_plans (marketing display) into membership_plans (operational)
-- Single table is the KISS answer: one source of truth for both landing page and billing.
-- Admin edits one record to control both the pricing card shown publicly and the plan
-- used for member assignment.

-- 1. Extend billing_interval to support one_time (Drop-In passes)
--    The column is TEXT so no type change needed; update any CHECK constraint if present.
ALTER TABLE membership_plans DROP CONSTRAINT IF EXISTS membership_plans_billing_interval_check;
ALTER TABLE membership_plans
  ADD CONSTRAINT membership_plans_billing_interval_check
  CHECK (billing_interval IN ('month', 'year', 'one_time'));

-- 2. Add display columns
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS features        JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS highlight       BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS highlight_label TEXT     NULL,
  ADD COLUMN IF NOT EXISTS cta_label       TEXT     NOT NULL DEFAULT 'Get Started',
  ADD COLUMN IF NOT EXISTS cta_href        TEXT     NOT NULL DEFAULT '/join',
  ADD COLUMN IF NOT EXISTS display_order   INT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visible         BOOLEAN  NOT NULL DEFAULT true;

-- 3. Seed / update the Soul JJ plans.
--    Uses INSERT … ON CONFLICT (name) DO UPDATE so the migration is idempotent.
--    Requires a unique index on name (add if missing).
CREATE UNIQUE INDEX IF NOT EXISTS membership_plans_name_unique ON membership_plans (name);

INSERT INTO membership_plans
  (name, description, price_cents, billing_interval, trial_days,
   max_classes_per_week, features, highlight, highlight_label,
   cta_label, cta_href, display_order, visible, status)
VALUES
  (
    'Individual',
    'Unlimited adult classes, month-to-month',
    18900, 'month', 7, NULL,
    '["Unlimited classes", "All Gi & No-Gi", "Open mat access", "No contract"]'::jsonb,
    false, NULL, 'Get Started', '/join', 1, true, 'active'
  ),
  (
    'Youth',
    'Kids program for ages 5–14',
    12900, 'month', 7, NULL,
    '["Unlimited youth classes", "Structured curriculum", "Safe & focused environment", "No contract"]'::jsonb,
    true, 'Most Popular', 'Enroll Now', '/join', 2, true, 'active'
  ),
  (
    'Family',
    '2 or more family members training together',
    27900, 'month', 7, NULL,
    '["All adult + youth classes", "2+ family members", "One monthly payment", "No contract"]'::jsonb,
    false, NULL, 'Get Started', '/join', 3, true, 'active'
  ),
  (
    'Drop-In',
    'Single class visit, no commitment',
    3000, 'one_time', 0, 1,
    '["Single class visit", "Gi or No-Gi", "Open mat eligible", "No commitment"]'::jsonb,
    false, NULL, 'Drop In', '/contact', 4, true, 'active'
  )
ON CONFLICT (name) DO UPDATE SET
  description     = EXCLUDED.description,
  price_cents     = EXCLUDED.price_cents,
  billing_interval = EXCLUDED.billing_interval,
  trial_days      = EXCLUDED.trial_days,
  max_classes_per_week = EXCLUDED.max_classes_per_week,
  features        = EXCLUDED.features,
  highlight       = EXCLUDED.highlight,
  highlight_label = EXCLUDED.highlight_label,
  cta_label       = EXCLUDED.cta_label,
  cta_href        = EXCLUDED.cta_href,
  display_order   = EXCLUDED.display_order,
  visible         = EXCLUDED.visible,
  status          = EXCLUDED.status;
