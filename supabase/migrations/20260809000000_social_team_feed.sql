-- Social team feed + self check-in from the member portal.
--
-- Everything gamification-related is locked to "own rows only" today
-- ("Members read own xp_events", "Members read own badges", "Members read own
-- check_ins"). That is the right default and stays untouched — widening those
-- policies would expose the whole `members` table (phones, emails, emergency
-- contacts, billing) to anyone with the publishable key and a REST client.
--
-- Instead these SECURITY DEFINER functions publish a deliberately narrow
-- projection: display name, belt, level/XP, streak, badge count. No contact
-- details, no payment data, no date of birth. The caller must be an
-- authenticated member; the functions resolve the caller themselves rather than
-- trusting a member_id argument, so one member cannot ask "what does X see".

-- ── Allow 'portal' as a check-in source ─────────────────────────────────────
--
-- Members can now check themselves in from their phone, not just from the
-- front-desk kiosk. Recording those as 'kiosk' would be a lie in the data the
-- gym reports on, and 'admin' even more so — the profe needs to be able to tell
-- "walked in and tapped the tablet" apart from "tapped their phone", because
-- only the first is corroborated by someone being physically at the desk.
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_source_check;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_source_check
  CHECK (source IN ('kiosk', 'admin', 'portal'));

COMMENT ON COLUMN public.check_ins.source IS
  'Where the check-in came from: kiosk (front-desk tablet), portal (member''s '
  'own device), or admin (recorded by staff on the member''s behalf).';

-- ── Helper: which member is calling? ────────────────────────────────────────
--
-- Returns the caller's member id, or NULL when the session isn't linked to a
-- member row (e.g. an admin-only account). Used by the feed functions to gate
-- access without duplicating the lookup in each one.
CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_member_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;

COMMENT ON FUNCTION public.current_member_id() IS
  'The calling user''s member id, or NULL if the session has no member row.';

-- ── Display name ────────────────────────────────────────────────────────────
--
-- "Fabrizio M." rather than the full surname. The feed is visible to everyone
-- who trains at the gym, which is a wider audience than the roster — first name
-- plus an initial is enough to recognise a training partner without publishing
-- a full legal name on a page a member could screenshot.
CREATE OR REPLACE FUNCTION public.member_display_name(
  p_first_name TEXT,
  p_last_name  TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT TRIM(
    COALESCE(NULLIF(TRIM(p_first_name), ''), 'Miembro') ||
    CASE
      WHEN NULLIF(TRIM(p_last_name), '') IS NULL THEN ''
      ELSE ' ' || UPPER(LEFT(TRIM(p_last_name), 1)) || '.'
    END
  );
$$;

COMMENT ON FUNCTION public.member_display_name(TEXT, TEXT) IS
  'Public-facing "First L." name for the social feed. Never the full surname.';

-- ── Level curve, extracted ──────────────────────────────────────────────────
--
-- get_member_gamification() inlines this for a single member. The leaderboard
-- needs it per row, so it lives in a function both can agree on — two
-- independent level formulas drifting apart is exactly the kind of bug a member
-- notices instantly ("the board says I'm 6, my card says 7").
--
-- Level n requires n(n+1)/2 * 100 total XP to finish, so invert that sum.
CREATE OR REPLACE FUNCTION public.xp_level(p_total INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(
    1,
    FLOOR((-1 + SQRT(1 + 8 * GREATEST(COALESCE(p_total, 0), 0)::numeric / 100)) / 2)::int + 1
  );
$$;

COMMENT ON FUNCTION public.xp_level(INT) IS
  'XP total -> level, matching the curve inlined in get_member_gamification.';

-- ── The team leaderboard ────────────────────────────────────────────────────
--
-- One row per active member, ordered by XP. Reuses get_training_day_streak and
-- get_longest_training_streak so the numbers here are computed exactly like the
-- ones on a member's own dashboard — two different definitions of "streak"
-- would be a support nightmare the first time someone compared the two.
CREATE OR REPLACE FUNCTION public.get_team_leaderboard(
  p_today DATE,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  member_id      INT,
  display_name   TEXT,
  belt           TEXT,
  stripes        SMALLINT,
  xp_total       INT,
  level          INT,
  streak_days    INT,
  longest_streak INT,
  badges_earned  INT,
  last_check_in  DATE,
  is_self        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller INT := public.current_member_id();
BEGIN
  -- Not a member → no feed. Returning zero rows rather than raising keeps the
  -- portal renderable for an admin-only account that has no member row.
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  -- Clamp rather than trust: a client asking for a million rows would turn a
  -- social page into a full scan plus a streak computation per row.
  p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  RETURN QUERY
  WITH badge_counts AS (
    SELECT mb.member_id AS mid, COUNT(*)::int AS earned
    FROM public.member_badges mb
    GROUP BY mb.member_id
  ),
  last_seen AS (
    SELECT c.member_id AS mid, MAX(c.class_date) AS last_date
    FROM public.check_ins c
    GROUP BY c.member_id
  )
  SELECT
    m.id,
    public.member_display_name(m.first_name, m.last_name),
    m.belt,
    m.stripes,
    COALESCE(x.xp_total, 0),
    public.xp_level(COALESCE(x.xp_total, 0)),
    public.get_training_day_streak(m.id, p_today),
    public.get_longest_training_streak(m.id, p_today),
    COALESCE(bc.earned, 0),
    ls.last_date,
    (m.id = v_caller)
  FROM public.members m
  LEFT JOIN public.v_member_xp x ON x.member_id = m.id
  LEFT JOIN badge_counts bc      ON bc.mid = m.id
  LEFT JOIN last_seen ls         ON ls.mid = m.id
  -- Only members who are actually training. A cancelled member sitting at the
  -- top of the board on last year's XP is demotivating, not social.
  WHERE m.status IN ('active', 'prospect')
  ORDER BY COALESCE(x.xp_total, 0) DESC, m.id ASC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_leaderboard(DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_leaderboard(DATE, INT) TO authenticated;

COMMENT ON FUNCTION public.get_team_leaderboard(DATE, INT) IS
  'Narrow public projection of every active member for the portal team feed. '
  'Caller must be an authenticated member; no contact or billing data exposed.';

-- ── Recent activity feed ────────────────────────────────────────────────────
--
-- Check-ins and badge awards interleaved into one reverse-chronological list —
-- "María trained Gi Fundamentals 4 minutes ago". Two UNIONed branches rather
-- than a table because they come from different sources and neither source is
-- a canonical "activity" record.
CREATE OR REPLACE FUNCTION public.get_team_activity(
  p_limit INT DEFAULT 30,
  p_days  INT DEFAULT 14
)
RETURNS TABLE (
  kind         TEXT,      -- 'check_in' | 'badge'
  member_id    INT,
  display_name TEXT,
  belt         TEXT,
  title        TEXT,      -- class name, or badge name
  icon         TEXT,      -- badge icon; NULL for check-ins
  occurred_at  TIMESTAMPTZ,
  is_self      BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller INT := public.current_member_id();
  v_since  TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  p_limit := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  p_days  := LEAST(GREATEST(COALESCE(p_days, 14), 1), 90);
  v_since := NOW() - (p_days || ' days')::INTERVAL;

  RETURN QUERY
  SELECT * FROM (
    SELECT
      'check_in'::TEXT      AS kind,
      m.id                  AS member_id,
      public.member_display_name(m.first_name, m.last_name) AS display_name,
      m.belt                AS belt,
      c.class_name          AS title,
      NULL::TEXT            AS icon,
      c.created_at          AS occurred_at,
      (m.id = v_caller)     AS is_self
    FROM public.check_ins c
    JOIN public.members m ON m.id = c.member_id
    WHERE c.created_at >= v_since
      AND m.status IN ('active', 'prospect')

    UNION ALL

    SELECT
      'badge'::TEXT,
      m.id,
      public.member_display_name(m.first_name, m.last_name),
      m.belt,
      b.name,
      b.icon,
      mb.awarded_at,
      (m.id = v_caller)
    FROM public.member_badges mb
    JOIN public.members m ON m.id = mb.member_id
    JOIN public.badges  b ON b.id = mb.badge_id
    WHERE mb.awarded_at >= v_since
      AND m.status IN ('active', 'prospect')
      -- Secret badges stay secret: revealing one in the feed spoils it for
      -- everyone who hasn't earned it yet.
      AND COALESCE(b.secret, FALSE) IS FALSE
  ) AS feed
  ORDER BY feed.occurred_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_activity(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_activity(INT, INT) TO authenticated;

COMMENT ON FUNCTION public.get_team_activity(INT, INT) IS
  'Interleaved check-in + badge activity for the portal team feed. Excludes '
  'secret badges so they are not spoiled. Caller must be an authenticated member.';
