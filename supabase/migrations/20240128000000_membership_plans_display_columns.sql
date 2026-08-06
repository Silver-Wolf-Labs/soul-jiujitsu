-- Consolidated: add all display columns to membership_plans and seed the four
-- Soul JJ plans with the original pricing card content.
-- Safe to run even if some columns already exist (IF NOT EXISTS).

-- 1. Ensure billing_interval allows one_time
ALTER TABLE membership_plans DROP CONSTRAINT IF EXISTS membership_plans_billing_interval_check;
ALTER TABLE membership_plans
  ADD CONSTRAINT membership_plans_billing_interval_check
  CHECK (billing_interval IN ('month', 'year', 'one_time'));

-- 2. Add all display columns
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS features        JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS highlight       BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS highlight_label TEXT     NULL,
  ADD COLUMN IF NOT EXISTS highlight_color TEXT     NULL,
  ADD COLUMN IF NOT EXISTS period_display  TEXT     NULL,
  ADD COLUMN IF NOT EXISTS cta_label       TEXT     NOT NULL DEFAULT 'Get Started',
  ADD COLUMN IF NOT EXISTS cta_href        TEXT     NOT NULL DEFAULT '/join',
  ADD COLUMN IF NOT EXISTS display_order   INT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visible         BOOLEAN  NOT NULL DEFAULT true;

-- 3. Unique index on name (required for ON CONFLICT below)
CREATE UNIQUE INDEX IF NOT EXISTS membership_plans_name_unique ON membership_plans (name);

-- 4. Seed / upsert the four Soul JJ plans (matches original fallback content)
INSERT INTO membership_plans
  (name, description, price_cents, billing_interval, trial_days,
   max_classes_per_week, features, highlight, highlight_color, highlight_label,
   period_display, cta_label, cta_href, display_order, visible, status)
VALUES
  (
    'Individual',
    'Unlimited adult classes, month-to-month',
    18900, 'month', 7, NULL,
    '["All adult Gi + No-Gi classes", "Open mat access", "No contracts"]'::jsonb,
    false, NULL, NULL, 'per month · unlimited',
    'Get Started', '#contact', 1, true, 'active'
  ),
  (
    'Kids',
    'Youth program for ages 7–16',
    12900, 'month', 7, NULL,
    '["Youth Gi & No-Gi classes", "Ages 7–16, grouped by age", "No contracts"]'::jsonb,
    true, 'black', 'Most Popular', 'per month · starting at',
    'Enroll Your Kid', '#contact', 2, true, 'active'
  ),
  (
    'Family',
    '2 or more family members training together',
    27900, 'month', 7, NULL,
    '["2+ family members", "All classes included", "No contracts"]'::jsonb,
    false, NULL, NULL, 'per month · starting at',
    'Join as a Family', '#contact', 3, true, 'active'
  ),
  (
    'Drop-In',
    'Single class visit, no commitment',
    3000, 'one_time', 0, 1,
    '["Visitors always welcome", "Show up before any class", "No booking needed"]'::jsonb,
    false, NULL, NULL, 'per visit',
    'See Schedule', '#schedule', 4, true, 'active'
  )
ON CONFLICT (name) DO UPDATE SET
  description          = EXCLUDED.description,
  price_cents          = EXCLUDED.price_cents,
  billing_interval     = EXCLUDED.billing_interval,
  trial_days           = EXCLUDED.trial_days,
  max_classes_per_week = EXCLUDED.max_classes_per_week,
  features             = EXCLUDED.features,
  highlight            = EXCLUDED.highlight,
  highlight_color      = EXCLUDED.highlight_color,
  highlight_label      = EXCLUDED.highlight_label,
  period_display       = EXCLUDED.period_display,
  cta_label            = EXCLUDED.cta_label,
  cta_href             = EXCLUDED.cta_href,
  display_order        = EXCLUDED.display_order,
  visible              = EXCLUDED.visible,
  status               = EXCLUDED.status;
