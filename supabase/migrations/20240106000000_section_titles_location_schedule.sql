-- ── Banners: expanded height option, deactivate all top banners ──────────────
ALTER TABLE banners ADD COLUMN IF NOT EXISTS expanded boolean NOT NULL DEFAULT false;
-- Seeded top banners should be inactive by default (admin activates explicitly)
UPDATE banners SET active = false WHERE section = 'top';

-- ── Schedule: instructor display + recurrence note ────────────────────────────
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS instructor_name varchar(16);
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS show_instructor boolean NOT NULL DEFAULT false;
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS recurrence_note text;

-- ── site_sections: customizable display titles and subtitles ──────────────────
ALTER TABLE site_sections ADD COLUMN IF NOT EXISTS display_title text;
ALTER TABLE site_sections ADD COLUMN IF NOT EXISTS display_subtitle text;

-- Seed default values (tag = subtitle, h2 = title)
UPDATE site_sections SET display_title = 'News & Updates',      display_subtitle = 'Latest'                WHERE key = 'updates';
UPDATE site_sections SET display_title = 'Class Schedule',      display_subtitle = 'When We Train'         WHERE key = 'schedule';
UPDATE site_sections SET display_title = 'The Team',            display_subtitle = 'Instructors & Guests'  WHERE key = 'team';
UPDATE site_sections SET display_title = 'Blog',                display_subtitle = 'From the Mats'         WHERE key = 'blog';
UPDATE site_sections SET display_title = 'Simple Pricing',      display_subtitle = 'Membership'            WHERE key = 'pricing';
UPDATE site_sections SET display_title = 'FAQ',                 display_subtitle = 'Questions'             WHERE key = 'faq';
UPDATE site_sections SET display_title = 'Stay in the Loop',    display_subtitle = null                    WHERE key = 'subscribe';
UPDATE site_sections SET display_title = 'Location & Contact',  display_subtitle = 'Find Us & Reach Out'   WHERE key = 'contact';
UPDATE site_sections SET display_title = 'Instagram',           display_subtitle = null                    WHERE key = 'instagram';

-- ── Location settings (admin-editable via /admin/location) ───────────────────
INSERT INTO site_settings (key, value) VALUES
  ('contact_address',    'TODO_ADDRESS'),
  ('contact_city',       'Dallas'),
  ('contact_state',      'TX'),
  ('contact_zip',        'TODO_ZIP'),
  ('contact_phone',      '(214) 546-7379'),
  ('contact_email',      'TODO_EMAIL'),
  ('contact_hours',      '[{"days":"Mon–Fri","hours":"6am – 8:30pm"},{"days":"Sat","hours":"10:30am – 2pm"},{"days":"Sun","hours":"12pm – 1:30pm"}]'),
  ('contact_map_embed',  '')
ON CONFLICT (key) DO NOTHING;
