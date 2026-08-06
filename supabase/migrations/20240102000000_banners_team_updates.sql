-- ── Banners table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id            serial       PRIMARY KEY,
  text          text         NOT NULL DEFAULT '',
  color         text         NOT NULL DEFAULT 'black', -- black | blue | purple | brown
  display_order int          NOT NULL DEFAULT 0,
  active        boolean      NOT NULL DEFAULT true,
  expires_at    timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active non-expired banners" ON banners
  FOR SELECT TO public
  USING (active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Authenticated users can manage banners" ON banners
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── Add active column to team ────────────────────────────────────────────────
ALTER TABLE team ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- ── Add expires_at column to updates ────────────────────────────────────────
ALTER TABLE updates ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- ── Banner rotation interval (seconds) ──────────────────────────────────────
INSERT INTO site_settings (key, value) VALUES ('banner_interval', '5')
ON CONFLICT (key) DO NOTHING;
