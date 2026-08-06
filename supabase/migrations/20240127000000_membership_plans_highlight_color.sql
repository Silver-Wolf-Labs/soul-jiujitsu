-- Add highlight_color and period_display to membership_plans.
--
-- highlight_color: one of 'black' | 'blue' | 'purple' | 'brown' | 'yellow' (nullable)
--   Controls the card border color and badge background on the public Pricing section.
--   When set, it supersedes the plain `highlight` boolean (which is derived from this).
--
-- period_display: optional free-text override for the period line under the price
--   e.g. "/month", "per visit", "/month · unlimited"
--   When NULL, the component falls back to formatPeriod(billing_interval).

ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS highlight_color TEXT NULL,
  ADD COLUMN IF NOT EXISTS period_display  TEXT NULL;

-- Back-fill the four seeded Soul JJ plans with representative colors and
-- period display text to match the reference Pricing section design.
UPDATE membership_plans SET
  highlight       = true,
  highlight_color = 'blue',
  highlight_label = 'Most Popular',
  period_display  = '/month'
WHERE name = 'Individual';

UPDATE membership_plans SET
  period_display = '/month'
WHERE name = 'Youth';

UPDATE membership_plans SET
  highlight       = true,
  highlight_color = 'yellow',
  highlight_label = 'Best Value',
  period_display  = '/month'
WHERE name = 'Family';

UPDATE membership_plans SET
  period_display = 'one time'
WHERE name = 'Drop-In';
