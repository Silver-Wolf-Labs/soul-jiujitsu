-- ── Add section to banners (top | pricing) ──────────────────────────────────
ALTER TABLE banners ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'top';

-- ── Add display_order to updates ─────────────────────────────────────────────
ALTER TABLE updates ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0;

-- ── Pricing plans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_plans (
  id            serial       PRIMARY KEY,
  tier          text         NOT NULL,
  price         text         NOT NULL,
  period        text         NOT NULL DEFAULT 'per month',
  features      jsonb        NOT NULL DEFAULT '[]',
  cta           text         NOT NULL DEFAULT 'Get Started',
  cta_href      text         NOT NULL DEFAULT '#contact',
  featured      boolean      NOT NULL DEFAULT false,
  highlight_color text,                        -- black | blue | purple | brown | yellow | null
  highlight_label text,                        -- "Most Popular" | "Limited Offer" | custom
  display_order int          NOT NULL DEFAULT 0,
  active        boolean      NOT NULL DEFAULT true,
  expires_at    timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active pricing plans" ON pricing_plans
  FOR SELECT TO public
  USING (active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Authenticated users can manage pricing plans" ON pricing_plans
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── FAQ items ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faq_items (
  id            serial       PRIMARY KEY,
  question      text         NOT NULL,
  answer        text         NOT NULL,
  display_order int          NOT NULL DEFAULT 0,
  active        boolean      NOT NULL DEFAULT true,
  expires_at    timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE faq_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active faq items" ON faq_items
  FOR SELECT TO public
  USING (active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Authenticated users can manage faq items" ON faq_items
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── Seed pricing plans ────────────────────────────────────────────────────────
INSERT INTO pricing_plans (tier, price, period, features, cta, cta_href, featured, highlight_color, highlight_label, display_order) VALUES
  ('Individual', '189', 'per month · unlimited',
   '["All adult Gi + No-Gi classes", "Open mat access", "No contracts", "Cancel with 10 days notice"]',
   'Get Started', '#contact', false, null, null, 1),
  ('Kids', '129', 'per month · starting at',
   '["Youth Gi & No-Gi classes", "Ages 7–16, grouped by age", "No contracts", "Cancel with 10 days notice"]',
   'Enroll Your Kid', '#contact', true, 'black', 'Most Popular', 2),
  ('Family', '279', 'per month · starting at',
   '["2+ family members", "All classes included", "No contracts", "Cancel with 10 days notice"]',
   'Join as a Family', '#contact', false, null, null, 3),
  ('Drop-In', '30', 'per visit',
   '["Visitors always welcome", "Show up before any class", "No booking needed"]',
   'See Schedule', '#schedule', false, null, null, 4);

-- ── Seed FAQ items ────────────────────────────────────────────────────────────
INSERT INTO faq_items (question, answer, display_order) VALUES
  ('What is Brazilian Jiu-Jitsu?',
   'A grappling martial art built around control, leverage, and submissions — chokes and joint locks. Think wrestling, but with controlled techniques that can end a fight. Developed from Japanese Jiu-Jitsu by Brazilians in the mid-20th century.',
   1),
  ('Is this like UFC or MMA?',
   'BJJ is one of the core parts of MMA, alongside striking and wrestling. In BJJ there''s no striking — so no worries. We have coaches with MMA and wrestling backgrounds if you want to go in that direction.',
   2),
  ('Who is Soul Jiu-Jitsu?',
   'A 5× BJJ World Champion and Hall of Famer. Rob Ables trained directly under Soul JJ and opened this Dallas affiliate in 2009. Soul JJ visits a few times a year for seminars.',
   3),
  ('What makes BJJ safe to practice?',
   'Safety centers on "tapping" — a signal that immediately stops all action. You tap before experiencing pain, so you''re always in control of the intensity. Partners are trained to respect the tap instantly.',
   4),
  ('Do I need to get in shape first?',
   'No. BJJ gets you in shape as a side effect of training. Just show up.',
   5),
  ('How does the free trial work?',
   'Come in 5 minutes before any class, sign the waiver, and start training for 7 days. No credit card, no pressure. Then decide if you want to join.',
   6),
  ('What do I need to bring?',
   'For your trial: a fitted t-shirt and athletic shorts with a drawstring. Optional mouthpiece. Once you join, we''ll help you find the right Gi.',
   7),
  ('Will I meet Joe Rogan?',
   'No. But he''d tell you to come train anyway.',
   8);

-- ── Updates interval setting ──────────────────────────────────────────────────
INSERT INTO site_settings (key, value) VALUES ('updates_interval', '15')
ON CONFLICT (key) DO NOTHING;

-- ── Trial strip settings ──────────────────────────────────────────────────────
INSERT INTO site_settings (key, value) VALUES
  ('trial_active', 'true'),
  ('trial_title', '7-Day Free Trial — No Credit Card Required'),
  ('trial_body', 'Show up 5 minutes before any class, sign the waiver, and start training. Simple as that.'),
  ('trial_cta', 'Claim Your Trial'),
  ('trial_cta_href', '#contact')
ON CONFLICT (key) DO NOTHING;
