-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: undoing a check-in left its auto-awarded badges behind.
--
-- Repro: a member's first-ever check-in awards "Primer día" (+25 XP). Staff
-- mis-scans, hits undo 10 seconds later. The check-in and its check-in XP
-- cascade away correctly, but member_badges has no FK to check_ins — so the
-- badge and its badge-XP survive. The member ends up holding a "first day"
-- badge with zero classes on record.
--
-- The rule logic used to live inline in evaluate_member_badges, which could only
-- ever award. This extracts it into member_qualifies_for_badge() so the same
-- predicate can be evaluated in both directions, then adds
-- reconcile_member_badges() to strip auto-awarded badges that no longer hold.
--
-- MANUAL badges are never touched. The profe gave those by hand for something
-- they saw on the mat; no rule can re-derive that, and silently removing one
-- would be much worse than leaving it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The predicate, extracted ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_qualifies_for_badge(
  p_member_id INT,
  p_badge_id  INT,
  p_today     DATE
)
RETURNS BOOLEAN
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
    -- No badge, or a manual-only badge: there is no rule to satisfy. Returning
    -- false here is safe because reconcile only ever looks at 'auto' rows.
    RETURN false;
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
      RETURN false;   -- unknown rule_kind: never award, never crash
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_qualifies_for_badge(INT, INT, DATE)
  TO authenticated, service_role;

-- ── Award, now delegating to the predicate ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.evaluate_member_badges(
  p_member_id INT,
  p_today     DATE
)
RETURNS TABLE(badge_slug TEXT, badge_name TEXT, badge_icon TEXT, badge_tier TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.* FROM badges b
    WHERE b.active = true
      AND b.rule_kind IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM member_badges mb
        WHERE mb.member_id = p_member_id AND mb.badge_id = b.id
      )
  LOOP
    IF member_qualifies_for_badge(p_member_id, r.id, p_today) THEN
      INSERT INTO member_badges (member_id, badge_id, awarded_via)
      VALUES (p_member_id, r.id, 'auto')
      ON CONFLICT (member_id, badge_id) DO NOTHING;

      IF FOUND THEN
        INSERT INTO xp_events (member_id, points, source, description, badge_id)
        VALUES (p_member_id, r.xp_reward, 'badge', r.name, r.id);

        badge_slug := r.slug;
        badge_name := r.name;
        badge_icon := r.icon;
        badge_tier := r.tier;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_member_badges(INT, DATE)
  TO authenticated, service_role;

-- ── Reconcile: strip auto-badges that no longer hold ────────────────────────

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
  r         RECORD;
  v_removed INT := 0;
BEGIN
  FOR r IN
    SELECT mb.badge_id
    FROM   member_badges mb
    JOIN   badges b ON b.id = mb.badge_id
    WHERE  mb.member_id   = p_member_id
      AND  mb.awarded_via = 'auto'      -- never touch a hand-awarded badge
      AND  b.rule_kind IS NOT NULL
  LOOP
    IF NOT member_qualifies_for_badge(p_member_id, r.badge_id, p_today) THEN
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

-- ── Trigger: reconcile automatically when a check-in disappears ─────────────
-- A trigger rather than app code, because check-ins are deleted from three
-- places (kiosk undo, admin delete, member cascade) and a badge surviving its
-- evidence is a data-integrity problem, not a UI concern.

CREATE OR REPLACE FUNCTION public.trg_reconcile_badges_after_check_in_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip when the member row itself is going away: the member_badges rows are
  -- being cascaded anyway, and re-evaluating mid-cascade is wasted work.
  IF EXISTS (SELECT 1 FROM members WHERE id = OLD.member_id) THEN
    PERFORM reconcile_member_badges(OLD.member_id, CURRENT_DATE);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS reconcile_badges_after_check_in_delete ON public.check_ins;

CREATE TRIGGER reconcile_badges_after_check_in_delete
  AFTER DELETE ON public.check_ins
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reconcile_badges_after_check_in_delete();
