-- Leaderboard opt-out.
--
-- The team feed publishes every active member's level, XP, streak and badge
-- count to every other member of the gym (see 20260809000000_social_team_feed).
-- That is what the gym asked for, and for most people it is the point. It is
-- also, for some people, exactly the reason they would rather not be on it: a
-- white belt three classes in does not necessarily want the whole roster reading
-- their numbers, and a member coming back from injury watches their streak
-- reset in public.
--
-- So the board becomes something a member can step off of, on their own, without
-- asking staff. Opt-out is the default-off flag rather than opt-in being the
-- default, because switching the existing behaviour to opt-in would silently
-- empty a board the gym is already using.

-- ── The flag ────────────────────────────────────────────────────────────────
--
-- IF NOT EXISTS because 20260811000000 is a standing lesson in this repo: a
-- migration recorded as applied whose table alteration did not land cannot be
-- re-run, so every DDL statement here is written to be safe on a database that
-- already has it.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS leaderboard_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.members.leaderboard_opt_out IS
  'Member chose to hide themselves from the portal team leaderboard. Set by the '
  'member themselves from /portal; they still see their own row so they can '
  'undo it. Does not affect the activity feed or any admin-facing report.';

-- Deliberately NOT added to prevent_member_sensitive_column_update's protected
-- list (20240135500000): this is the one column on `members` a member is
-- supposed to be able to flip about themselves. The existing
-- `member_update_own` RLS policy already scopes that to their own row.

-- ── The board, minus the people who left it ─────────────────────────────────
--
-- Same signature and same column set as before — TeamMemberEntry in
-- src/lib/supabase/types.ts mirrors it positionally through the RPC, and adding
-- a column here would silently change the shape every caller destructures.
-- The opt-out state therefore does NOT travel on this projection; the portal
-- reads the caller's own flag separately (getOwnLeaderboardOptOut).
--
-- The only change is the WHERE clause, and the interesting half of it is the
-- exception for the caller.
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
    -- Opted out of the board, for everyone except themselves.
    --
    -- The caller keeps seeing their own row on purpose. A toggle that makes you
    -- vanish from your own screen gives you no way to confirm it worked and no
    -- obvious way back — you would have to trust that a control you can no
    -- longer see is still there. Their row is also the only one they could
    -- already see in full elsewhere on the same page (XP card, streak card,
    -- badge wall), so showing it leaks nothing: the projection they get of
    -- themselves is strictly narrower than what /portal already renders above.
    --
    -- COALESCE, not `IS FALSE`, so the semantics survive the column being made
    -- nullable later; it is NOT NULL today.
    AND (COALESCE(m.leaderboard_opt_out, FALSE) IS FALSE OR m.id = v_caller)
  ORDER BY COALESCE(x.xp_total, 0) DESC, m.id ASC
  LIMIT p_limit;
END;
$$;

-- CREATE OR REPLACE preserves grants, but they are re-stated because a function
-- dropped and recreated by hand during an incident would otherwise come back
-- executable by PUBLIC.
REVOKE ALL ON FUNCTION public.get_team_leaderboard(DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_leaderboard(DATE, INT) TO authenticated;

COMMENT ON FUNCTION public.get_team_leaderboard(DATE, INT) IS
  'Narrow public projection of every active member for the portal team feed. '
  'Caller must be an authenticated member; no contact or billing data exposed. '
  'Members with leaderboard_opt_out are excluded for everyone but themselves.';
