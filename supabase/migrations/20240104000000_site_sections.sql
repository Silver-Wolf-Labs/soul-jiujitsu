CREATE TABLE IF NOT EXISTS site_sections (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO site_sections (key, label, display_order, visible) VALUES
  ('updates',   'News & Updates', 1, true),
  ('schedule',  'Class Schedule',  2, true),
  ('team',      'Our Team',        3, true),
  ('blog',      'From the Mats',   4, true),
  ('pricing',   'Simple Pricing',  5, true),
  ('faq',       'FAQ',             6, true),
  ('instagram', 'Instagram',       7, true),
  ('subscribe', 'Subscribe',       8, true),
  ('contact',   'Contact',         9, true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE site_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read site_sections" ON site_sections FOR SELECT USING (true);
CREATE POLICY "Auth all site_sections" ON site_sections FOR ALL USING (auth.role() = 'authenticated');
