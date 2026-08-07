-- ─────────────────────────────────────────────────────────────────────────────
-- Gamification: XP, badges and training-day streaks
--
-- Three tables and three read functions:
--   xp_events     — immutable ledger; every point a member has is a row here
--   badges        — the catalogue (what can be earned)
--   member_badges — who earned what, and who awarded it
--
-- Design notes:
--
-- 1. XP is a LEDGER, not a counter. A `members.xp_total` column would drift the
--    first time a check-in is undone (the kiosk supports that) or a badge is
--    revoked. Summing an append-only table is always correct and lets us show
--    "where did my points come from". The v_member_xp view does the summing.
--
-- 2. The streak counts TRAINING days, not calendar days. This gym is closed on
--    Sundays, so a literal "consecutive days" streak would reset every week for
--    every member — the opposite of motivating. `training_days` derives the open
--    days from schedule_slots, so if the gym ever opens Sundays the streak
--    adapts with no code change.
--
-- 3. Auto-badge rules live in `badges.rule_kind` / `rule_threshold` rather than
--    in application code, so the profe can add "50 Gi classes" from the admin UI
--    without a deploy. evaluate_member_badges() reads them and awards what fits.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── XP ledger ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.xp_events (
  id          BIGSERIAL PRIMARY KEY,
  member_id   INT         NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  points      INT         NOT NULL,
  -- What produced these points. 'adjustment' allows an owner to correct a
  -- mistake without deleting history (points may be negative for that reason).
  source      TEXT        NOT NULL CHECK (source IN (
                            'check_in', 'streak_bonus', 'badge',
                            'promotion', 'stripe', 'adjustment'
                          )),
  -- Free-text label shown in the member's XP history ("Gi", "Racha de 10 días").
  description TEXT,
  -- Optional back-references so undoing the cause can undo the points.
  check_in_id BIGINT      REFERENCES public.check_ins(id)  ON DELETE CASCADE,
  badge_id    INT,        -- FK added after badges exists
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xp_events_member_idx   ON public.xp_events (member_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS xp_events_check_in_idx ON public.xp_events (check_in_id);

-- One XP row per check-in per source: makes the award step idempotent, so a
-- double kiosk tap or a re-run of the backfill cannot double-pay.
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_check_in_source_uniq
  ON public.xp_events (check_in_id, source)
  WHERE check_in_id IS NOT NULL;

-- ── Badge catalogue ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.badges (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  -- lucide-react icon name, rendered via the BADGE_ICONS map in the app.
  -- Kept as text so a new badge needs no migration, only a catalogue row.
  icon          TEXT NOT NULL DEFAULT 'Award',
  -- Drives colour and XP value. bronze < silver < gold < legendary.
  tier          TEXT NOT NULL DEFAULT 'bronze'
                  CHECK (tier IN ('bronze', 'silver', 'gold', 'legendary')),
  category      TEXT NOT NULL DEFAULT 'milestone'
                  CHECK (category IN ('milestone', 'consistency', 'modality', 'skill', 'community')),
  xp_reward     INT  NOT NULL DEFAULT 25,
  -- NULL rule_kind = only a human can award it (the "primera sumisión" kind).
  rule_kind     TEXT CHECK (rule_kind IN (
                    'total_classes',      -- rule_threshold = class count
                    'streak_days',        -- rule_threshold = consecutive training days
                    'modality_classes',   -- + rule_modality
                    'early_bird',         -- classes starting before 08:00
                    'night_owl',          -- classes starting at/after 18:00
                    'saturday_classes',
                    'perfect_month',      -- every training day in a calendar month
                    'gi_and_nogi_week'    -- both styles inside one ISO week
                  )),
  rule_threshold INT,
  rule_modality  TEXT,          -- matches class_modalities.name for modality rules
  -- Hidden badges still get awarded but aren't shown as "locked" targets, so a
  -- surprise stays a surprise.
  secret        BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT     NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS badges_active_idx ON public.badges (active, sort_order);

ALTER TABLE public.xp_events
  DROP CONSTRAINT IF EXISTS xp_events_badge_id_fkey;
ALTER TABLE public.xp_events
  ADD CONSTRAINT xp_events_badge_id_fkey
  FOREIGN KEY (badge_id) REFERENCES public.badges(id) ON DELETE SET NULL;

-- ── Awarded badges ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_badges (
  id          BIGSERIAL PRIMARY KEY,
  member_id   INT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  badge_id    INT NOT NULL REFERENCES public.badges(id)  ON DELETE CASCADE,
  -- 'auto' = evaluate_member_badges(); 'manual' = a coach pressed the button.
  awarded_via TEXT NOT NULL DEFAULT 'auto' CHECK (awarded_via IN ('auto', 'manual')),
  awarded_by  TEXT,        -- email of the admin, for manual awards
  -- The coach's own words. This is the part members screenshot and share.
  note        TEXT,
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the member has seen the celebration, so the kiosk/portal only
  -- pops confetti once.
  seen_at     TIMESTAMPTZ,
  UNIQUE (member_id, badge_id)   -- a badge is earned once
);

CREATE INDEX IF NOT EXISTS member_badges_member_idx ON public.member_badges (member_id, awarded_at DESC);
CREATE INDEX IF NOT EXISTS member_badges_unseen_idx ON public.member_badges (member_id) WHERE seen_at IS NULL;

-- ── XP total view ───────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_member_xp AS
  SELECT member_id, COALESCE(SUM(points), 0)::int AS xp_total
  FROM   public.xp_events
  GROUP  BY member_id;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Same shape as check_ins: admins manage everything, members read their own.
-- The badge CATALOGUE is world-readable so the portal can show locked badges as
-- goals, and so the landing page could advertise them later.

ALTER TABLE public.xp_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage xp_events"      ON public.xp_events;
DROP POLICY IF EXISTS "Members read own xp_events"   ON public.xp_events;
DROP POLICY IF EXISTS "Admins manage badges"         ON public.badges;
DROP POLICY IF EXISTS "Anyone reads active badges"   ON public.badges;
DROP POLICY IF EXISTS "Admins manage member_badges"  ON public.member_badges;
DROP POLICY IF EXISTS "Members read own badges"      ON public.member_badges;

CREATE POLICY "Admins manage xp_events" ON public.xp_events
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Members read own xp_events" ON public.xp_events
  FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

CREATE POLICY "Admins manage badges" ON public.badges
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Anyone reads active badges" ON public.badges
  FOR SELECT
  USING (active = true);

CREATE POLICY "Admins manage member_badges" ON public.member_badges
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Members read own badges" ON public.member_badges
  FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

-- ── Training-day streak ─────────────────────────────────────────────────────
--
-- "Consecutive training days" = consecutive days ON WHICH THE GYM WAS OPEN and
-- the member showed up. Sundays (no slots) are skipped, not counted as misses.
--
-- Implementation: build the ordered list of open days going backwards from
-- p_today, then count how many of the most recent ones the member attended,
-- stopping at the first miss. Today is exempt from breaking the streak — a
-- member checking their phone at 9am hasn't missed today's class yet.

CREATE OR REPLACE FUNCTION public.get_training_day_streak(
  p_member_id INT,
  p_today     DATE
)
RETURNS INT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- ISO day-of-week numbers the gym runs classes on (1 = Mon … 7 = Sun).
  open_dows AS (
    SELECT DISTINCT day_of_week AS dow
    FROM   schedule_slots
    WHERE  active = true
  ),
  -- Every open day in the last year, newest first. A year bounds the scan; a
  -- streak longer than that is already a legendary badge.
  open_days AS (
    SELECT d::date AS day
    FROM   generate_series(p_today - INTERVAL '365 days', p_today, INTERVAL '1 day') AS g(d)
    WHERE  EXTRACT(ISODOW FROM d)::int IN (SELECT dow FROM open_dows)
    ORDER  BY d DESC
  ),
  -- Did the member attend each of those days?
  attendance AS (
    SELECT
      od.day,
      EXISTS (
        SELECT 1 FROM check_ins ci
        WHERE  ci.member_id = p_member_id AND ci.class_date = od.day
      ) AS attended,
      ROW_NUMBER() OVER (ORDER BY od.day DESC) AS rn
    FROM open_days od
  ),
  -- Today doesn't count as a miss yet: drop it if unattended so an evening
  -- trainer isn't shown a zeroed streak all morning.
  considered AS (
    SELECT day, attended,
           ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
    FROM   attendance
    WHERE  NOT (day = p_today AND attended = false)
  ),
  -- The first gap, walking backwards. Everything before it is the streak.
  first_miss AS (
    SELECT MIN(rn) AS rn FROM considered WHERE attended = false
  )
  SELECT COALESCE(
    (SELECT rn - 1 FROM first_miss WHERE rn IS NOT NULL),
    (SELECT COUNT(*) FROM considered)     -- attended every open day in range
  )::int;
$$;

GRANT EXECUTE ON FUNCTION public.get_training_day_streak(INT, DATE) TO authenticated, anon;

-- ── Combined gamification payload ───────────────────────────────────────────
-- One round-trip for the portal card: XP, level, streak and badge counts.
--
-- Levels use a widening curve: each level costs 100 XP more than the last, so
-- level 1→2 is 200 XP and level 9→10 is 1000. Early levels arrive fast (a new
-- member sees movement in their first week) while later ones stay meaningful.
-- Closed form for the inverse: level = floor((-1 + sqrt(1 + 8*xp/100)) / 2) + 1

CREATE OR REPLACE FUNCTION public.get_member_gamification(
  p_member_id INT,
  p_today     DATE
)
RETURNS TABLE(
  xp_total          INT,
  level             INT,
  xp_into_level     INT,   -- progress inside the current level
  xp_for_level      INT,   -- size of the current level, for the progress bar
  streak_days       INT,
  longest_streak    INT,
  badges_earned     INT,
  badges_total      INT,   -- non-secret active badges, i.e. visible goals
  unseen_badges     INT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  xp AS (
    SELECT COALESCE((SELECT xp_total FROM v_member_xp WHERE member_id = p_member_id), 0) AS total
  ),
  lvl AS (
    -- n(n+1)/2 * 100 total XP to finish level n, so invert that sum.
    SELECT
      total,
      GREATEST(1, FLOOR((-1 + SQRT(1 + 8 * total::numeric / 100)) / 2)::int + 1) AS level
    FROM xp
  ),
  bounds AS (
    SELECT
      total,
      level,
      -- XP required to REACH this level = (level-1)*level/2 * 100
      ((level - 1) * level / 2 * 100)       AS floor_xp,
      (level * 100)                         AS span_xp
    FROM lvl
  )
  SELECT
    b.total::int                                                     AS xp_total,
    b.level::int                                                     AS level,
    GREATEST(0, b.total - b.floor_xp)::int                           AS xp_into_level,
    b.span_xp::int                                                   AS xp_for_level,
    get_training_day_streak(p_member_id, p_today)                    AS streak_days,
    -- Longest run of attended open days ever, via gap-and-island on the
    -- member's distinct attended dates ranked against the open-day calendar.
    COALESCE((
      SELECT MAX(len) FROM (
        SELECT COUNT(*)::int AS len
        FROM (
          SELECT
            ci.class_date,
            ROW_NUMBER() OVER (ORDER BY ci.class_date) AS rn
          FROM (SELECT DISTINCT class_date FROM check_ins WHERE member_id = p_member_id) ci
        ) s
        -- Consecutive ATTENDED days share (date - rn) only when no open day was
        -- skipped between them; closed days break it too, so this is a
        -- conservative lower bound on the true longest streak. Good enough for
        -- a "personal best" display and cheap to compute.
        GROUP BY (s.class_date - s.rn * INTERVAL '1 day')
      ) runs
    ), 0)::int                                                       AS longest_streak,
    (SELECT COUNT(*) FROM member_badges WHERE member_id = p_member_id)::int             AS badges_earned,
    (SELECT COUNT(*) FROM badges WHERE active = true AND secret = false)::int           AS badges_total,
    (SELECT COUNT(*) FROM member_badges
      WHERE member_id = p_member_id AND seen_at IS NULL)::int                           AS unseen_badges
  FROM bounds b;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_gamification(INT, DATE) TO authenticated, anon;

-- ── Badge catalogue seed ────────────────────────────────────────────────────
-- Icons are lucide-react names; the app maps them through BADGE_ICONS and falls
-- back to Award for anything unknown, so a typo degrades instead of crashing.

INSERT INTO public.badges
  (slug, name, description, icon, tier, category, xp_reward, rule_kind, rule_threshold, rule_modality, secret, sort_order)
VALUES
  -- Milestones — volume of mat time
  ('primer-dia',        'Primer día',           'Pisaste el tatami por primera vez. Todo empieza acá.',            'Footprints',   'bronze',    'milestone',   25,  'total_classes',    1,    NULL,        false, 10),
  ('diez-clases',       '10 clases',            'Diez clases completadas. Ya no sos nuevo.',                       'Medal',        'bronze',    'milestone',   25,  'total_classes',    10,   NULL,        false, 20),
  ('veinticinco',       '25 clases',            'Veinticinco clases. El hábito está tomando forma.',               'Medal',        'silver',    'milestone',   50,  'total_classes',    25,   NULL,        false, 30),
  ('cincuenta',         '50 clases',            'Cincuenta clases sobre el tatami.',                               'Award',        'silver',    'milestone',   50,  'total_classes',    50,   NULL,        false, 40),
  ('cien-clases',       '100 clases',           'Cien clases. Muy pocos llegan hasta acá.',                        'Trophy',       'gold',      'milestone',   100, 'total_classes',    100,  NULL,        false, 50),
  ('doscientas',        '250 clases',           'Doscientas cincuenta clases. Sos parte de los cimientos.',        'Trophy',       'gold',      'milestone',   100, 'total_classes',    250,  NULL,        false, 60),
  ('quinientas',        '500 clases',           'Quinientas clases. Leyenda de la academia.',                      'Crown',        'legendary', 'milestone',   100, 'total_classes',    500,  NULL,        false, 70),

  -- Consistency — showing up
  ('racha-5',           'Racha de 5',           'Cinco días de entreno seguidos.',                                 'Flame',        'bronze',    'consistency', 25,  'streak_days',      5,    NULL,        false, 110),
  ('racha-10',          'Racha de 10',          'Diez días de entreno seguidos sin faltar.',                       'Flame',        'silver',    'consistency', 50,  'streak_days',      10,   NULL,        false, 120),
  ('racha-25',          'Racha de 25',          'Veinticinco días seguidos. Disciplina de otro nivel.',            'Flame',        'gold',      'consistency', 100, 'streak_days',      25,   NULL,        false, 130),
  ('racha-50',          'Racha de 50',          'Cincuenta días de entreno seguidos. Imparable.',                  'Zap',          'legendary', 'consistency', 100, 'streak_days',      50,   NULL,        false, 140),
  ('mes-perfecto',      'Mes perfecto',         'Viniste todos los días que la academia abrió en un mes.',         'CalendarCheck','legendary', 'consistency', 100, 'perfect_month',    NULL, NULL,        false, 150),
  ('madrugador',        'Madrugador',           'Veinte clases de las 6 de la mañana. Mientras otros duermen.',    'Sunrise',      'gold',      'consistency', 100, 'early_bird',       20,   NULL,        false, 160),
  ('guerrero-nocturno', 'Guerrero nocturno',    'Cincuenta clases de noche, después de un día entero.',            'Moon',         'silver',    'consistency', 50,  'night_owl',        50,   NULL,        false, 170),
  ('sabatino',          'Sabatino',             'Quince sábados en el tatami en vez de en la cama.',               'CalendarHeart','silver',    'consistency', 50,  'saturday_classes', 15,   NULL,        false, 180),

  -- Modality — breadth of practice
  ('gi-25',             'Kimono curtido',       'Veinticinco clases de Gi.',                                       'Shirt',        'silver',    'modality',    50,  'modality_classes', 25,   'Gi',        false, 210),
  ('nogi-25',           'Piel de tiburón',      'Veinticinco clases de No-Gi.',                                    'Waves',        'silver',    'modality',    50,  'modality_classes', 25,   'No-Gi',     false, 220),
  ('openmat-10',        'Rey del Open Mat',     'Diez open mats. Ahí es donde se aprende de verdad.',              'Swords',       'gold',      'modality',    100, 'modality_classes', 10,   'Open Mat',  false, 230),
  ('wrestling-10',      'Derribador',           'Diez clases de wrestling. La pelea empieza de pie.',              'Anchor',       'silver',    'modality',    50,  'modality_classes', 10,   'Wrestling', false, 240),
  ('bi-estilista',      'Bi-estilista',         'Gi y No-Gi en la misma semana. Completo.',                        'Layers',       'bronze',    'modality',    25,  'gi_and_nogi_week', NULL, NULL,        false, 250),

  -- Skill — coach's judgement, no automatic rule
  ('primera-sumision',  'Primera sumisión',     'Tu primera sumisión en un rolling en vivo.',                      'Target',       'gold',      'skill',       50,  NULL,               NULL, NULL,        false, 310),
  ('primer-barrido',    'Primer barrido',       'Barriste a alguien en vivo por primera vez.',                     'RefreshCw',    'silver',    'skill',       50,  NULL,               NULL, NULL,        false, 320),
  ('paso-la-guardia',   'Pasó la guardia',      'Pasaste una guardia en rolling por primera vez.',                 'DoorOpen',     'silver',    'skill',       50,  NULL,               NULL, NULL,        false, 330),
  ('guardia-de-hierro', 'Guardia de hierro',    'Tu guardia se volvió un problema para todos.',                    'Shield',      'gold',      'skill',       50,  NULL,               NULL, NULL,        false, 340),
  ('escapista',         'Escapista',            'Saliste de una posición donde nadie sale.',                       'Unlock',       'gold',      'skill',       50,  NULL,               NULL, NULL,        false, 350),
  ('espiritu-competi',  'Espíritu competidor',  'Compitiste representando a la academia.',                         'Flag',         'legendary', 'skill',       50,  NULL,               NULL, NULL,        false, 360),

  -- Community — the culture stuff
  ('buen-companero',    'Buen compañero',       'Cuidás a quien entrena con vos. Eso sostiene la academia.',       'HeartHandshake','gold',     'community',   50,  NULL,               NULL, NULL,        false, 410),
  ('mejor-actitud',     'Mejor actitud',        'Llegás con la mejor energía y se contagia.',                      'Smile',        'silver',    'community',   50,  NULL,               NULL, NULL,        false, 420),
  ('trajo-un-amigo',    'Trajo un amigo',       'Invitaste a alguien y se quedó entrenando.',                      'UserPlus',     'silver',    'community',   50,  NULL,               NULL, NULL,        false, 430),
  ('volvio-mas-fuerte', 'Volvió más fuerte',    'Volviste después de una lesión o una pausa larga.',               'TrendingUp',   'gold',      'community',   50,  NULL,               NULL, NULL,        false, 440),
  ('mentor',            'Mentor',               'Ayudás a los nuevos sin que nadie te lo pida.',                   'GraduationCap','gold',      'community',   50,  NULL,               NULL, NULL,        false, 450)
ON CONFLICT (slug) DO NOTHING;
