-- ─────────────────────────────────────────────────────────────────────────────
-- Replace `schedule` with `schedule_slots`
-- Implements the lean model recommended by principal engineer:
--   separate discipline / category / level / audience_note
--   use day_of_week INT (1=Mon…7=Sun) + TIME columns instead of text
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS schedule CASCADE;

CREATE TABLE schedule_slots (
  id            SERIAL       PRIMARY KEY,
  day_of_week   SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- 1=Mon, 7=Sun
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,

  title         TEXT         NOT NULL,           -- "Gi", "No-Gi", "Open Mat", "Leg Attack"
  category      TEXT         NOT NULL            -- class | open_mat | competition | youth
                             CHECK (category IN ('class', 'open_mat', 'competition', 'youth')),
  discipline    TEXT                             -- gi | nogi | mixed | conditioning
                             CHECK (discipline IS NULL OR discipline IN ('gi', 'nogi', 'mixed', 'conditioning')),
  level         TEXT                             -- all_levels | fundamentals | intermediate | advanced | expert
                             CHECK (level IS NULL OR level IN ('all_levels', 'fundamentals', 'intermediate', 'advanced', 'expert')),
  audience_note    TEXT,                         -- "Members Only", "Ages 7–10", "Women Only", "Invite Only"
  area             TEXT,                         -- "Mat 1", "Mat 2"

  instructor_name  TEXT,                         -- displayed when show_instructor = true
  show_instructor  BOOLEAN      NOT NULL DEFAULT FALSE,
  link_label       TEXT,                         -- sign-up pill label, e.g. "Sign Up"
  link_url         TEXT,                         -- sign-up pill URL

  sort_order    INT          NOT NULL DEFAULT 0,
  active        BOOLEAN      NOT NULL DEFAULT TRUE
);

ALTER TABLE schedule_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active slots"
  ON schedule_slots FOR SELECT TO anon, authenticated
  USING (active = TRUE);

CREATE POLICY "Admin full access on schedule_slots"
  ON schedule_slots FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE
  ));

-- ── Soul JJ seed ───────────────────────────────────────────────────────────

INSERT INTO schedule_slots
  (day_of_week, start_time, end_time, title, category, discipline, level, audience_note, area, sort_order)
VALUES

-- ── Monday ──────────────────────────────────────────────────────────────────
(1, '06:00', '07:00', 'Gi',                   'class',       'gi',    'all_levels',   NULL,          NULL,    10),
(1, '11:30', '13:00', 'Open Mat',              'open_mat',    'mixed', 'all_levels',   'Members Only', NULL,   20),
(1, '12:00', '13:00', 'Gi',                   'class',       'gi',    'all_levels',   NULL,          NULL,    30),
(1, '17:00', '18:00', 'Youth Gi',              'youth',       'gi',    'all_levels',   'Ages 7–10',   'Mat 1', 40),
(1, '17:00', '18:00', 'Youth Gi',              'youth',       'gi',    'all_levels',   'Ages 11–16',  'Mat 2', 50),
(1, '18:00', '19:00', 'Gi',                   'class',       'gi',    'all_levels',   '16 Yrs+',     NULL,    60),
(1, '19:00', '20:00', 'No-Gi Competition',     'competition', 'nogi',  'advanced',     'Invite Only', NULL,    70),

-- ── Tuesday ─────────────────────────────────────────────────────────────────
(2, '06:00', '07:00', 'No-Gi',                'class',       'nogi',  'all_levels',   NULL,          NULL,    10),
(2, '11:30', '13:00', 'Open Mat',              'open_mat',    'mixed', 'all_levels',   'Members Only', NULL,   20),
(2, '12:00', '13:00', 'No-Gi',                'class',       'nogi',  'all_levels',   NULL,          NULL,    30),
(2, '17:00', '18:00', 'Youth No-Gi',           'youth',       'nogi',  'all_levels',   'Ages 7–10',   'Mat 1', 40),
(2, '17:00', '18:00', 'Youth No-Gi',           'youth',       'nogi',  'all_levels',   'Ages 11–16',  'Mat 2', 50),
(2, '18:00', '19:00', 'No-Gi',                'class',       'nogi',  'intermediate', NULL,          'Mat 1', 60),
(2, '18:00', '19:00', 'No-Gi Fundamentals',    'class',       'nogi',  'fundamentals', '16 Yrs+',     'Mat 2', 70),
(2, '19:00', '20:00', 'Leg Attack',            'class',       'nogi',  'all_levels',   NULL,          NULL,    80),

-- ── Wednesday ───────────────────────────────────────────────────────────────
(3, '06:00', '07:00', 'Gi',                   'class',       'gi',    'all_levels',   NULL,          NULL,    10),
(3, '11:30', '13:00', 'Open Mat',              'open_mat',    'mixed', 'all_levels',   'Members Only', NULL,   20),
(3, '12:00', '13:00', 'Gi',                   'class',       'gi',    'all_levels',   NULL,          NULL,    30),
(3, '17:00', '18:00', 'Youth Gi',              'youth',       'gi',    'all_levels',   'Ages 7–10',   'Mat 1', 40),
(3, '17:00', '18:00', 'Youth Gi',              'youth',       'gi',    'all_levels',   'Ages 11–16',  'Mat 2', 50),
(3, '18:00', '19:00', 'Gi',                   'class',       'gi',    'all_levels',   '16 Yrs+',     NULL,    60),
(3, '19:00', '20:00', 'No-Gi',                'class',       'nogi',  'all_levels',   NULL,          NULL,    70),

-- ── Thursday ────────────────────────────────────────────────────────────────
(4, '06:00', '07:00', 'No-Gi',                'class',       'nogi',  'all_levels',   NULL,          NULL,    10),
(4, '11:30', '13:00', 'Open Mat',              'open_mat',    'mixed', 'all_levels',   'Members Only', NULL,   20),
(4, '12:00', '13:00', 'No-Gi',                'class',       'nogi',  'all_levels',   NULL,          NULL,    30),
(4, '17:00', '18:00', 'Youth No-Gi',           'youth',       'nogi',  'all_levels',   'Ages 7–10',   'Mat 1', 40),
(4, '17:00', '18:00', 'Youth No-Gi',           'youth',       'nogi',  'all_levels',   'Ages 11–16',  'Mat 2', 50),
(4, '18:00', '19:00', 'No-Gi',                'class',       'nogi',  'intermediate', NULL,          'Mat 1', 60),
(4, '18:00', '19:00', 'No-Gi Fundamentals',    'class',       'nogi',  'fundamentals', '16 Yrs+',     'Mat 2', 70),
(4, '19:00', '20:00', 'Takedowns',             'class',       'nogi',  'all_levels',   NULL,          NULL,    80),

-- ── Friday ───────────────────────────────────────────────────────────────────
(5, '06:00', '08:00', 'Open Mat',              'open_mat',    'mixed', 'all_levels',   'Members Only', NULL,   10),
(5, '11:30', '13:00', 'Open Mat',              'open_mat',    'mixed', 'all_levels',   'Members Only', NULL,   20),
(5, '12:00', '13:00', 'Gi',                   'class',       'gi',    'all_levels',   NULL,          NULL,    30),
(5, '18:00', '19:00', 'Gi Fundamentals',       'class',       'gi',    'fundamentals', '16 Yrs+',     NULL,    40),

-- ── Saturday ────────────────────────────────────────────────────────────────
(6, '10:00', '11:00', 'Youth Competition',     'youth',       'mixed', 'advanced',     'Invite Only', NULL,    10),
(6, '11:00', '12:00', 'No-Gi Fundamentals',    'class',       'nogi',  'fundamentals', '16 Yrs+',     'Mat 1', 20),
(6, '11:00', '12:00', 'Ladies Only No-Gi',     'class',       'nogi',  'all_levels',   'Women Only',  'Mat 2', 30),
(6, '12:00', '13:00', 'No-Gi',                'class',       'nogi',  'all_levels',   NULL,          NULL,    40),
(6, '13:00', '15:00', 'Open Mat',              'open_mat',    'nogi',  'all_levels',   'Members Only', NULL,   50),

-- ── Sunday ──────────────────────────────────────────────────────────────────
(7, '06:00', '09:00', 'Open Mat',              'open_mat',    'mixed', 'all_levels',   'Members Only', NULL,   10),
(7, '12:00', '15:00', 'Open Mat',              'open_mat',    'mixed', 'all_levels',   'Members Only', NULL,   20);
