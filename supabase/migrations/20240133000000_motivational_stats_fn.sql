-- ─────────────────────────────────────────────────────────────────────────────
-- Motivational stats for kiosk profile card
-- Replaces the generic "consistency rank" with four explicit, motivating stats:
--   1. Classes this month + month rank vs other members
--   2. Consecutive-week streak
--   3. All-time class count
--   4. Classes this week + 28-day personal average
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_member_motivational_stats(
  p_member_id INT,
  p_today     DATE        -- pass gym-local date from the server action
)
RETURNS TABLE(
  classes_this_month  INT,
  month_rank          BIGINT,   -- 1 = most classes this month
  month_total         BIGINT,   -- members with ≥1 class this month
  week_streak         INT,      -- consecutive weeks with ≥1 class (most recent)
  all_time_classes    BIGINT,
  classes_this_week   INT,
  classes_last_28d    INT,      -- used by caller to compute avg/week
  last_class_name     TEXT,
  last_class_date     DATE
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- Date anchors derived from the gym's local "today"
  month_start AS (SELECT DATE_TRUNC('month', p_today)::date AS d),
  week_start  AS (SELECT DATE_TRUNC('week',  p_today)::date AS d),
  d28_start   AS (SELECT (p_today - 27)                     AS d),

  -- All check-ins for this member (used multiple times below)
  my_ins AS (
    SELECT class_name, class_date
    FROM   check_ins
    WHERE  member_id = p_member_id
  ),

  -- Per-member class count for the current calendar month (all members)
  month_counts AS (
    SELECT member_id, COUNT(*)::int AS cnt
    FROM   check_ins
    WHERE  class_date >= (SELECT d FROM month_start)
      AND  class_date <= p_today
    GROUP  BY member_id
  ),

  -- This member's month count (0 if none)
  my_month_cnt AS (
    SELECT COALESCE(
      (SELECT cnt FROM month_counts WHERE member_id = p_member_id), 0
    ) AS v
  ),

  -- ── Consecutive-week streak (gap-and-island trick, descending) ──────────────
  -- Each distinct ISO week (Monday-anchored) the member had ≥1 class.
  member_weeks AS (
    SELECT DISTINCT DATE_TRUNC('week', class_date)::date AS wk
    FROM   my_ins
  ),
  -- Row-number assigned newest-first so consecutive weeks share the same grp.
  -- For a sequence [W10, W9, W8]: wk + rn*7 = W10+7, W9+14, W8+21 — all W11.
  numbered AS (
    SELECT wk, ROW_NUMBER() OVER (ORDER BY wk DESC)::int AS rn
    FROM   member_weeks
  ),
  grouped AS (
    SELECT wk, (wk + rn * 7) AS grp   -- date + integer = date in PG
    FROM   numbered
  ),
  streak_groups AS (
    SELECT COUNT(*)::int AS len, MAX(wk) AS last_wk
    FROM   grouped
    GROUP  BY grp
  ),

  -- Most recent check-in (for profile display)
  last_class AS (
    SELECT class_name, class_date
    FROM   my_ins
    ORDER  BY class_date DESC
    LIMIT  1
  )

  SELECT
    -- 1. This month
    (SELECT v FROM my_month_cnt)::int                                                           AS classes_this_month,
    (SELECT COUNT(*) + 1 FROM month_counts WHERE cnt > (SELECT v FROM my_month_cnt))::bigint    AS month_rank,
    (SELECT COUNT(*) FROM month_counts)::bigint                                                 AS month_total,

    -- 2. Streak (current/most-recent consecutive-week run)
    COALESCE((SELECT len FROM streak_groups ORDER BY last_wk DESC LIMIT 1), 0)::int            AS week_streak,

    -- 3. All-time
    (SELECT COUNT(*) FROM my_ins)::bigint                                                       AS all_time_classes,

    -- 4. This week + 28-day window
    (SELECT COUNT(*) FROM my_ins WHERE class_date >= (SELECT d FROM week_start))::int           AS classes_this_week,
    (SELECT COUNT(*) FROM my_ins WHERE class_date >= (SELECT d FROM d28_start))::int            AS classes_last_28d,

    -- Last class (for profile "Last class: …" line)
    (SELECT class_name FROM last_class)                                                         AS last_class_name,
    (SELECT class_date FROM last_class)                                                         AS last_class_date
  ;
$$;

GRANT EXECUTE ON FUNCTION get_member_motivational_stats(INT, DATE) TO authenticated, anon;
