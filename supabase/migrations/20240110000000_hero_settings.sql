-- ─────────────────────────────────────────────────────────────────────────────
-- Hero / Jumbotron settings
--
-- Seeds admin-editable content for the homepage hero section.
-- Keyed in site_settings. Admin edits via /admin/hero.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO site_settings (key, value) VALUES
  ('hero_eyebrow',          'Soul Jiu-Jitsu Affiliate · Dallas, TX · Est. 2009'),
  ('hero_sub_tagline',      'Brazilian Jiu-Jitsu for every level. Day, night, or early morning — 7 days a week.'),
  ('hero_stat_left_num',    '7×'),
  ('hero_stat_left_label',  'Days a Week'),
  ('hero_stat_right_num',   '15+'),
  ('hero_stat_right_label', 'Years in Dallas'),
  ('hero_stat_wide_num',    'Gi · No-Gi · Open Mat'),
  ('hero_stat_wide_label',  'Classes offered')
ON CONFLICT (key) DO NOTHING;
