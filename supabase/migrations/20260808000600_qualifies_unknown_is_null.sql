-- ─────────────────────────────────────────────────────────────────────────────
-- Make member_qualifies_for_badge() fail SAFE instead of failing "no".
--
-- The predicate returned false for an unrecognised rule_kind. That was correct
-- when it could only ever award — false just meant "don't hand it out". But
-- reconcile_member_badges() now reads the same predicate, and there false means
-- DELETE THE BADGE AND CLAW BACK ITS XP.
--
-- So the footgun: add a rule_kind to the CHECK constraint and the catalogue,
-- ship the badge, forget a WHEN branch here — and the next time anybody undoes
-- a check-in, the trigger strips that badge from every member who holds it,
-- silently, with no error anywhere. Badges are the emotional payload of this
-- feature; losing one the member earned is much worse than never awarding it.
--
-- Fix: unknown rule_kind now returns NULL — "I can't evaluate this" — and the
-- two callers read it in the direction that's safe for each:
--   • award    → NULL is not true, so nothing is awarded (IF NULL THEN is false)
--   • reconcile → only deletes on an explicit false, so NULL means KEEP
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_qualifies_for_badge(
  p_member_id INT,
  p_badge_id  INT,
  p_today     DATE
)
RETURNS BOOLEAN                 -- true = qualifies, false = does not, NULL = unknown
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_streak INT;
BEGIN
  SELECT * INTO r FROM badges WHERE id = p_badge_id;

  IF r.id IS NULL OR r.rule_kind IS NULL THEN
    -- No such badge, or a manual-only badge: there is no rule to evaluate, which
    -- is not the same as "the rule says no". NULL keeps reconcile's hands off it.
    RETURN NULL;
  END IF;

  CASE r.rule_kind

    WHEN 'total_classes' THEN
      RETURN (SELECT COUNT(*) FROM check_ins WHERE member_id = p_member_id)
             >= r.rule_threshold;

    WHEN 'streak_days' THEN
      -- A streak badge is a HIGH-WATER MARK, not a current state: reaching 30
      -- consecutive days is an achievement you don't lose by missing a Tuesday.
      -- So this checks the longest streak ever, not the live one — otherwise
      -- reconcile would strip streak badges the moment a streak ended.
      v_streak := get_longest_training_streak(p_member_id, p_today);
      RETURN v_streak >= r.rule_threshold;

    WHEN 'modality_classes' THEN
      RETURN (
        SELECT COUNT(*)
        FROM   check_ins ci
        LEFT   JOIN schedule_slots ss ON ss.id = ci.schedule_slot_id
        LEFT   JOIN class_modalities cm ON cm.id = ss.modality_id
        WHERE  ci.member_id = p_member_id
          AND (cm.name = r.rule_modality OR ci.class_name ILIKE '%' || r.rule_modality || '%')
      ) >= r.rule_threshold;

    WHEN 'early_bird' THEN
      RETURN (
        SELECT COUNT(*)
        FROM   check_ins ci
        JOIN   schedule_slots ss ON ss.id = ci.schedule_slot_id
        WHERE  ci.member_id = p_member_id AND ss.start_time < TIME '08:00'
      ) >= r.rule_threshold;

    WHEN 'night_owl' THEN
      RETURN (
        SELECT COUNT(*)
        FROM   check_ins ci
        JOIN   schedule_slots ss ON ss.id = ci.schedule_slot_id
        WHERE  ci.member_id = p_member_id AND ss.start_time >= TIME '18:00'
      ) >= r.rule_threshold;

    WHEN 'saturday_classes' THEN
      RETURN (
        SELECT COUNT(*) FROM check_ins
        WHERE  member_id = p_member_id
          AND  EXTRACT(ISODOW FROM class_date) = 6
      ) >= r.rule_threshold;

    WHEN 'gi_and_nogi_week' THEN
      RETURN EXISTS (
        SELECT 1
        FROM   check_ins ci
        WHERE  ci.member_id = p_member_id
        GROUP  BY DATE_TRUNC('week', ci.class_date)
        HAVING BOOL_OR(ci.class_name ILIKE '%gi%' AND ci.class_name NOT ILIKE '%no-gi%' AND ci.class_name NOT ILIKE '%nogi%')
           AND BOOL_OR(ci.class_name ILIKE '%no-gi%' OR ci.class_name ILIKE '%nogi%')
      );

    WHEN 'perfect_month' THEN
      RETURN EXISTS (
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

    ELSE
      -- A rule_kind this function doesn't implement. Never award it, and never
      -- let reconcile take it away either. See the header.
      RAISE WARNING 'member_qualifies_for_badge: unhandled rule_kind % on badge %',
        r.rule_kind, p_badge_id;
      RETURN NULL;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_qualifies_for_badge(INT, INT, DATE)
  TO authenticated, service_role;

-- ── Reconcile: delete only on an explicit false ─────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_member_badges(
  p_member_id INT,
  p_today     DATE
)
RETURNS INT                     -- how many badges were removed
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          RECORD;
  v_ok       BOOLEAN;
  v_removed  INT := 0;
BEGIN
  FOR r IN
    SELECT mb.badge_id
    FROM   member_badges mb
    JOIN   badges b ON b.id = mb.badge_id
    WHERE  mb.member_id   = p_member_id
      AND  mb.awarded_via = 'auto'      -- never touch a hand-awarded badge
      AND  b.rule_kind IS NOT NULL
  LOOP
    v_ok := member_qualifies_for_badge(p_member_id, r.badge_id, p_today);

    -- `IS FALSE`, not `NOT v_ok`: NULL means the rule couldn't be evaluated, and
    -- `NOT NULL` is NULL, which an IF treats as false — i.e. it would fall
    -- through to the delete. Being explicit is the whole point of this change.
    IF v_ok IS FALSE THEN
      DELETE FROM member_badges
      WHERE member_id = p_member_id AND badge_id = r.badge_id;

      -- Take the badge XP back too. xp_events.badge_id is ON DELETE SET NULL
      -- (deleting a catalogue badge shouldn't rewrite history), so the ledger
      -- row has to go explicitly.
      DELETE FROM xp_events
      WHERE member_id = p_member_id AND badge_id = r.badge_id AND source = 'badge';

      v_removed := v_removed + 1;
    END IF;
  END LOOP;

  RETURN v_removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_member_badges(INT, DATE) TO service_role;
