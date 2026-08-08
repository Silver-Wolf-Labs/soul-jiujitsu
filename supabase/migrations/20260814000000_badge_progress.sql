-- ─────────────────────────────────────────────────────────────────────────────
-- Numeric progress towards a badge.
--
-- member_qualifies_for_badge() answers yes / no / can't-tell. That is everything
-- the awarding path needs and nothing a tracker can draw: "you do not have the
-- 50-class badge" is not a progress bar, "37 of 50" is.
--
-- The obvious way to get the number would be a second function with the same
-- eight WHERE clauses in it. That is the failure mode this migration is written
-- to avoid: the rules are already a fragile, load-bearing surface (see
-- 20260808000600 on what happens when a rule_kind is forgotten in one place), and
-- two copies would drift the first time the profe's "Gi" modality is renamed —
-- leaving a member staring at a full bar and no badge, or an award with a bar
-- stuck at 80%.
--
-- So the direction is inverted instead. This migration makes the COUNTER the
-- source of truth and rewrites the predicate as a thin wrapper over it. There is
-- exactly one copy of every rule after this, and it is the one the tracker draws
-- from — a bar that reads 50/50 and a badge that was not awarded become
-- impossible by construction rather than by vigilance.
--
-- The NULL semantics from 20260808000600 are preserved exactly, because
-- reconcile_member_badges() still deletes badges on an explicit false:
--   • unknown rule_kind        → qualifies NULL (never award, never revoke)
--   • manual-only (NULL rule)  → qualifies NULL
--   • countable rule with a NULL rule_threshold (a mis-seeded row) → the
--     comparison is NULL, so qualifies is NULL. Fails safe in both directions.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_badge_progress(
  p_member_id INT,
  p_badge_id  INT,
  p_today     DATE
)
RETURNS TABLE (
  -- Echoed back so the caller can decide how to LABEL the numbers ("clases" vs
  -- "días") without a second lookup, and so the app can tell "no rule" apart
  -- from "rule this database version cannot evaluate".
  rule_kind     TEXT,
  -- NULL for rules that are not a count — see the two boolean branches below.
  current_value INT,
  target_value  INT,
  -- Same three-valued contract as member_qualifies_for_badge, which is now
  -- defined in terms of this column.
  qualifies     BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         RECORD;
  v_current INT;
  v_target  INT;
  v_ok      BOOLEAN;
BEGIN
  SELECT * INTO r FROM badges WHERE id = p_badge_id;

  IF r.id IS NULL OR r.rule_kind IS NULL THEN
    -- No such badge, or a manual-only badge: nothing to count and nothing to
    -- judge. r.rule_kind is NULL in both cases, which is what the app reads to
    -- render "el profe lo otorga" instead of an empty progress bar.
    RETURN QUERY SELECT r.rule_kind, NULL::INT, NULL::INT, NULL::BOOLEAN;
    RETURN;
  END IF;

  v_target := r.rule_threshold;

  CASE r.rule_kind

    WHEN 'total_classes' THEN
      v_current := (SELECT COUNT(*) FROM check_ins WHERE member_id = p_member_id);

    WHEN 'streak_days' THEN
      -- The LONGEST streak, not the live one — deliberately the same figure the
      -- award reads (a 30-day streak is a high-water mark you don't lose by
      -- missing a Tuesday). Showing the live streak here would mean a tracker
      -- that walks backwards while the badge it points at stays earned.
      v_current := get_longest_training_streak(p_member_id, p_today);

    WHEN 'modality_classes' THEN
      v_current := (
        SELECT COUNT(*)
        FROM   check_ins ci
        LEFT   JOIN schedule_slots ss ON ss.id = ci.schedule_slot_id
        LEFT   JOIN class_modalities cm ON cm.id = ss.modality_id
        WHERE  ci.member_id = p_member_id
          AND (cm.name = r.rule_modality OR ci.class_name ILIKE '%' || r.rule_modality || '%')
      );

    WHEN 'early_bird' THEN
      v_current := (
        SELECT COUNT(*)
        FROM   check_ins ci
        JOIN   schedule_slots ss ON ss.id = ci.schedule_slot_id
        WHERE  ci.member_id = p_member_id AND ss.start_time < TIME '08:00'
      );

    WHEN 'night_owl' THEN
      v_current := (
        SELECT COUNT(*)
        FROM   check_ins ci
        JOIN   schedule_slots ss ON ss.id = ci.schedule_slot_id
        WHERE  ci.member_id = p_member_id AND ss.start_time >= TIME '18:00'
      );

    WHEN 'saturday_classes' THEN
      v_current := (
        SELECT COUNT(*) FROM check_ins
        WHERE  member_id = p_member_id
          AND  EXTRACT(ISODOW FROM class_date) = 6
      );

    -- ── The two rules that are not a count ──────────────────────────────────
    --
    -- "Both styles in one week" and "every open day of a month" are all-or-
    -- nothing: there is no honest denominator, because partial credit would
    -- have to invent one ("1 of 2 styles" is not what the badge asks for, and a
    -- perfect month is not 90% perfect). current_value and target_value stay
    -- NULL and the app renders these as a single milestone rather than a bar —
    -- see badgeProgress()'s "binary" kind.
    WHEN 'gi_and_nogi_week' THEN
      v_ok := EXISTS (
        SELECT 1
        FROM   check_ins ci
        WHERE  ci.member_id = p_member_id
        GROUP  BY DATE_TRUNC('week', ci.class_date)
        HAVING BOOL_OR(ci.class_name ILIKE '%gi%' AND ci.class_name NOT ILIKE '%no-gi%' AND ci.class_name NOT ILIKE '%nogi%')
           AND BOOL_OR(ci.class_name ILIKE '%no-gi%' OR ci.class_name ILIKE '%nogi%')
      );
      RETURN QUERY SELECT r.rule_kind, NULL::INT, NULL::INT, v_ok;
      RETURN;

    WHEN 'perfect_month' THEN
      v_ok := EXISTS (
        WITH open_dows AS (
          SELECT DISTINCT day_of_week AS dow FROM schedule_slots WHERE active = true
        ),
        months AS (
          SELECT DISTINCT DATE_TRUNC('month', class_date)::date AS m
          FROM   check_ins WHERE member_id = p_member_id
        ),
        open_days AS (
          SELECT m.m AS month, g.d::date AS day
          FROM   months m
          CROSS  JOIN generate_series(
                   m.m,
                   LEAST((m.m + INTERVAL '1 month' - INTERVAL '1 day')::date, p_today),
                   INTERVAL '1 day'
                 ) AS g(d)
          WHERE  EXTRACT(ISODOW FROM g.d)::int IN (SELECT dow FROM open_dows)
        )
        SELECT 1
        FROM   open_days od
        GROUP  BY od.month
        HAVING COUNT(*) > 0
           AND COUNT(*) = COUNT(*) FILTER (
                 WHERE EXISTS (
                   SELECT 1 FROM check_ins ci
                   WHERE ci.member_id = p_member_id AND ci.class_date = od.day
                 )
               )
      );
      RETURN QUERY SELECT r.rule_kind, NULL::INT, NULL::INT, v_ok;
      RETURN;

    ELSE
      -- A rule_kind this database version doesn't implement. Same contract as
      -- before: never award it, never let reconcile take it away, and give the
      -- app a rule_kind it can recognise as "unknown" so the tracker shows the
      -- badge without a bar instead of a bar frozen at zero.
      RAISE WARNING 'member_badge_progress: unhandled rule_kind % on badge %',
        r.rule_kind, p_badge_id;
      RETURN QUERY SELECT r.rule_kind, NULL::INT, NULL::INT, NULL::BOOLEAN;
      RETURN;
  END CASE;

  -- Countable rules land here. `v_current >= v_target` is NULL when the
  -- threshold is NULL, which is the fail-safe answer for a mis-seeded row.
  RETURN QUERY SELECT r.rule_kind, v_current, v_target, (v_current >= v_target);
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_badge_progress(INT, INT, DATE)
  TO authenticated, service_role;

-- ── The predicate, now derived ──────────────────────────────────────────────
--
-- Same signature, same three-valued return, same callers (evaluate_member_badges
-- and reconcile_member_badges, both of which are left untouched). The rules moved
-- out; the contract did not.
--
-- Kept as its own function rather than inlining the subselect at the call sites:
-- it is the name the awarding path is written against, it is GRANTed separately,
-- and "does this member qualify" is worth a name of its own.
CREATE OR REPLACE FUNCTION public.member_qualifies_for_badge(
  p_member_id INT,
  p_badge_id  INT,
  p_today     DATE
)
RETURNS BOOLEAN                 -- true = qualifies, false = does not, NULL = unknown
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.qualifies FROM public.member_badge_progress(p_member_id, p_badge_id, p_today) p;
$$;

GRANT EXECUTE ON FUNCTION public.member_qualifies_for_badge(INT, INT, DATE)
  TO authenticated, service_role;
