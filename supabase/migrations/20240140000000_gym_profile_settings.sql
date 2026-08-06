-- Seed gym identity keys into site_settings.
-- These values match the Soul Jiu-Jitsu defaults in src/lib/gym-profile.ts.
--
-- TODO(setup): TODO_* values are placeholders. Set the real values via the
-- admin panel, by running `npx tsx scripts/bootstrap-gym.ts`, or by editing
-- this migration before first run. See SETUP.md.

INSERT INTO site_settings (key, value) VALUES
  ('gym_short_name',        'Soul JJ'),
  ('gym_logo_text',         'SOUL'),
  ('gym_logo_dot',          E'•'),
  ('gym_city_name',         'TODO_CITY'),
  ('gym_tagline',           'Train. Improve. Belong.'),
  ('gym_timezone',          'America/Chicago'),
  ('gym_affiliate_text',    'Soul Jiu-Jitsu. Training athletes of all levels.'),
  ('gym_footer_tags',       'BJJ,No-Gi,Youth'),
  ('gym_join_button_text',  'Join Soul JJ'),
  ('gym_meta_title',        'Soul Jiu-Jitsu | Brazilian Jiu-Jitsu'),
  ('gym_meta_description',  'Train Brazilian Jiu-Jitsu at Soul Jiu-Jitsu. Gi, No-Gi, and Youth classes for all levels.'),
  ('gym_meta_url',          'http://localhost:3000'),
  ('gym_instagram_url',     ''),
  ('gym_instagram_handle',  '')
ON CONFLICT (key) DO NOTHING;
