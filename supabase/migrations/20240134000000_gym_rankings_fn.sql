-- ─────────────────────────────────────────────────────────────────────────────
-- Gym-wide ranking function for kiosk "vs Gym" toggle
--
-- PRIVACY: This function returns ONLY the requesting member's rank position
-- and the total active member count per category.  No other member's data,
-- identity, or stats are ever returned.
--
-- Stats ranked:
--   1. Classes this calendar month (among members with ≥1 class this month)
--   2. Current week-streak (among all members with any check-in history)
--   3. All-time class count (among all members with any check-in history)
--   4. Classes this week (among members with ≥1 class this week)
--
-- Rank semantics: 1 = best.  If the member has 0 for a period (month/week),
-- their rank is total+1 — the caller can detect rank > total as "unranked".
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_member_gym_rankings(
  p_member_id INT,
  p_today     DATE        -- gym-local date passed from the server action
)
RETURNS TABLE(
  month_rank    BIGINT,
  month_total   BIGINT,
  streak_rank   BIGINT,
  streak_total  BIGINT,
  alltime_rank  BIGINT,
  alltime_total BIGINT,
  week_rank     BIGINT,
  week_total    BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- ── Date anchors ────────────────────────────────────────────────────────────
  month_start AS (SELECT DATE_TRUNC('month', p_today)::date AS d),
  week_start  AS (SELECT DATE_TRUNC('week',  p_today)::date AS d),

  -- ── Classes this month per member ─────────────────────────────────────────
  month_counts AS (
    SELECT member_id, COUNT(*)::int AS cnt
    FROM   check_ins
    WHERE  class_date >= (SELECT d FROM month_start)
      AND  class_date <= p_today
    GROUP  BY member_id
  ),

  -- ── Classes this week per member ──────────────────────────────────────────
  week_counts AS (
    SELECT member_id, COUNT(*)::int AS cnt
    FROM   check_ins
    WHERE  class_date >= (SELECT d FROM week_start)
      AND  class_date <= p_today
    GROUP  BY member_id
  ),

  -- ── All-time classes per member ───────────────────────────────────────────
  alltime_counts AS (
    SELECT member_id, COUNT(*)::int AS cnt
    FROM   check_ins
    GROUP  BY member_id
  ),

  -- ── Current consecutive-week streak per member (gap-and-island) ───────────
  -- Same algorithm as get_member_motivational_stats, applied to ALL members.
  all_weeks AS (
    SELECT DISTINCT member_id, DATE_TRUNC('week', class_date)::date AS wk
    FROM   check_ins
  ),
  numbered AS (
    SELECT member_id, wk,
           ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY wk DESC)::int AS rn
    FROM   all_weeks
  ),
  grouped AS (
    -- Consecutive weeks share the same grp value (date arithmetic in PG)
    SELECT member_id, wk, (wk + rn * 7) AS grp
    FROM   numbered
  ),
  streak_groups AS (
    SELECT member_id, COUNT(*)::int AS len, MAX(wk) AS last_wk
    FROM   grouped
    GROUP  BY member_id, grp
  ),
  -- Keep only the most-recent streak group per member
  member_streaks AS (
    SELECT DISTINCT ON (member_id) member_id, len AS streak
    FROM   streak_groups
    ORDER  BY member_id, last_wk DESC
  )

  SELECT
    -- Month: count of members with MORE classes + 1
    -- (member not in month_counts → 0 classes → rank = total+1)
    (SELECT COUNT(*) + 1
     FROM   month_counts
     WHERE  cnt > COALESCE(
               (SELECT cnt FROM month_counts WHERE member_id = p_member_id), 0
             ))::bigint                                        AS month_rank,
    (SELECT COUNT(*) FROM month_counts)::bigint               AS month_total,

    -- Streak rank
    (SELECT COUNT(*) + 1
     FROM   member_streaks
     WHERE  streak > COALESCE(
               (SELECT streak FROM member_streaks WHERE member_id = p_member_id), 0
             ))::bigint                                        AS streak_rank,
    (SELECT COUNT(*) FROM member_streaks)::bigint             AS streak_total,

    -- All-time rank
    (SELECT COUNT(*) + 1
     FROM   alltime_counts
     WHERE  cnt > COALESCE(
               (SELECT cnt FROM alltime_counts WHERE member_id = p_member_id), 0
             ))::bigint                                        AS alltime_rank,
    (SELECT COUNT(*) FROM alltime_counts)::bigint             AS alltime_total,

    -- Week rank
    (SELECT COUNT(*) + 1
     FROM   week_counts
     WHERE  cnt > COALESCE(
               (SELECT cnt FROM week_counts WHERE member_id = p_member_id), 0
             ))::bigint                                        AS week_rank,
    (SELECT COUNT(*) FROM week_counts)::bigint                AS week_total
  ;
$$;

GRANT EXECUTE ON FUNCTION get_member_gym_rankings(INT, DATE) TO authenticated, anon;
