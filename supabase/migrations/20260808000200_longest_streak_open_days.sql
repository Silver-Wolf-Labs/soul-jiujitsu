-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: longest_streak must use the same "open day" basis as the current streak.
--
-- The first cut counted islands of consecutive CALENDAR dates, which every
-- closed Sunday fractured. Result: a member on a live 7-day streak was shown a
-- personal best of 6 — a number that is impossible by definition and reads as a
-- bug to the member looking at it.
--
-- This computes the best run over the gym's OPEN days, so it is directly
-- comparable to get_training_day_streak() and always >= it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_longest_training_streak(
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
  open_dows AS (
    SELECT DISTINCT day_of_week AS dow
    FROM   schedule_slots
    WHERE  active = true
  ),
  -- A personal best is for life, so the window starts at the member's first
  -- check-in rather than the 365-day bound the current streak uses. A few years
  -- of daily rows is a trivial scan, and truncating someone's record silently
  -- would be worse than the cost.
  span AS (
    SELECT COALESCE(MIN(class_date), p_today) AS first_day
    FROM   check_ins
    WHERE  member_id = p_member_id
  ),
  open_days AS (
    SELECT
      g.d::date AS day,
      ROW_NUMBER() OVER (ORDER BY g.d) AS seq   -- position in the open-day sequence
    FROM   span s
    CROSS  JOIN generate_series(s.first_day, p_today, INTERVAL '1 day') AS g(d)
    WHERE  EXTRACT(ISODOW FROM g.d)::int IN (SELECT dow FROM open_dows)
  ),
  attended AS (
    SELECT od.day, od.seq
    FROM   open_days od
    WHERE  EXISTS (
             SELECT 1 FROM check_ins ci
             WHERE  ci.member_id = p_member_id AND ci.class_date = od.day
           )
  ),
  -- Gap-and-island over `seq`, not over the date. Consecutive attended OPEN
  -- days share (seq - rn) even when a closed day sits between them.
  islands AS (
    SELECT seq - ROW_NUMBER() OVER (ORDER BY seq) AS island
    FROM   attended
  )
  SELECT COALESCE(MAX(len), 0)::int
  FROM   (SELECT COUNT(*)::int AS len FROM islands GROUP BY island) runs;
$$;

GRANT EXECUTE ON FUNCTION public.get_longest_training_streak(INT, DATE) TO authenticated, anon;

-- Re-declare the payload function to delegate to it. Body is otherwise
-- unchanged from 20260808000000; only the longest_streak expression moves.

CREATE OR REPLACE FUNCTION public.get_member_gamification(
  p_member_id INT,
  p_today     DATE
)
RETURNS TABLE(
  xp_total          INT,
  level             INT,
  xp_into_level     INT,
  xp_for_level      INT,
  streak_days       INT,
  longest_streak    INT,
  badges_earned     INT,
  badges_total      INT,
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
    SELECT
      total,
      GREATEST(1, FLOOR((-1 + SQRT(1 + 8 * total::numeric / 100)) / 2)::int + 1) AS level
    FROM xp
  ),
  bounds AS (
    SELECT
      total,
      level,
      ((level - 1) * level / 2 * 100)       AS floor_xp,
      (level * 100)                         AS span_xp
    FROM lvl
  )
  SELECT
    b.total::int                                                                        AS xp_total,
    b.level                                                                             AS level,
    (b.total - b.floor_xp)::int                                                         AS xp_into_level,
    b.span_xp::int                                                                      AS xp_for_level,
    get_training_day_streak(p_member_id, p_today)                                       AS streak_days,
    get_longest_training_streak(p_member_id, p_today)                                   AS longest_streak,
    (SELECT COUNT(*) FROM member_badges WHERE member_id = p_member_id)::int              AS badges_earned,
    (SELECT COUNT(*) FROM badges WHERE active = true AND secret = false)::int            AS badges_total,
    (SELECT COUNT(*) FROM member_badges
      WHERE member_id = p_member_id AND seen_at IS NULL)::int                            AS unseen_badges
  FROM bounds b;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_gamification(INT, DATE) TO authenticated, anon;
