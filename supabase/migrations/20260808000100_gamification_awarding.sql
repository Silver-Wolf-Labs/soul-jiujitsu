-- ─────────────────────────────────────────────────────────────────────────────
-- Gamification part 2: awarding XP and evaluating auto-badges
--
-- award_check_in_xp()      — points for one check-in (idempotent)
-- evaluate_member_badges() — award every auto-badge the member now qualifies for
-- backfill_gamification()  — replay history so nobody starts at zero
--
-- Everything here is SECURITY DEFINER and idempotent: safe to call twice, safe
-- to re-run after adding a badge to the catalogue. The unique indexes do the
-- real enforcement, so concurrency can't double-award.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── XP for a check-in ───────────────────────────────────────────────────────
-- 10 XP per class, plus a streak bonus of 2 XP per consecutive training day,
-- capped at 20. The cap matters: uncapped, a 50-day streak would pay 100 XP a
-- class and drown out every other source.

CREATE OR REPLACE FUNCTION public.award_check_in_xp(
  p_check_in_id BIGINT
)
RETURNS INT                     -- total XP granted for this check-in
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id  INT;
  v_date       DATE;
  v_class      TEXT;
  v_streak     INT;
  v_bonus      INT;
  v_granted    INT := 0;
BEGIN
  SELECT member_id, class_date, class_name
    INTO v_member_id, v_date, v_class
  FROM check_ins WHERE id = p_check_in_id;

  IF v_member_id IS NULL THEN
    RETURN 0;                   -- check-in vanished (undone); nothing to pay
  END IF;

  -- Base points. ON CONFLICT makes a repeat call a no-op rather than a
  -- double-payment — the kiosk can retry safely.
  INSERT INTO xp_events (member_id, points, source, description, check_in_id, occurred_at)
  VALUES (v_member_id, 10, 'check_in', v_class, p_check_in_id, now())
  ON CONFLICT (check_in_id, source) WHERE check_in_id IS NOT NULL DO NOTHING;

  IF FOUND THEN
    v_granted := v_granted + 10;
  END IF;

  -- Streak bonus, evaluated as of the check-in's own date so a backfill of old
  -- rows pays what the member earned back then, not what they'd earn today.
  v_streak := get_training_day_streak(v_member_id, v_date);
  v_bonus  := LEAST(20, GREATEST(0, v_streak * 2));

  IF v_bonus > 0 THEN
    INSERT INTO xp_events (member_id, points, source, description, check_in_id, occurred_at)
    VALUES (v_member_id, v_bonus, 'streak_bonus',
            'Racha de ' || v_streak || ' día' || CASE WHEN v_streak = 1 THEN '' ELSE 's' END,
            p_check_in_id, now())
    ON CONFLICT (check_in_id, source) WHERE check_in_id IS NOT NULL DO NOTHING;

    IF FOUND THEN
      v_granted := v_granted + v_bonus;
    END IF;
  END IF;

  RETURN v_granted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_check_in_xp(BIGINT) TO authenticated;

-- ── Auto-badge evaluation ───────────────────────────────────────────────────
-- Walks the catalogue's rule-bearing rows and awards anything newly satisfied.
-- Returns the slugs awarded so the caller can celebrate them on screen.

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
  r            RECORD;
  v_qualifies  BOOLEAN;
  v_streak     INT;
BEGIN
  v_streak := get_training_day_streak(p_member_id, p_today);

  FOR r IN
    SELECT b.* FROM badges b
    WHERE b.active = true
      AND b.rule_kind IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM member_badges mb
        WHERE mb.member_id = p_member_id AND mb.badge_id = b.id
      )
  LOOP
    v_qualifies := false;

    CASE r.rule_kind

      WHEN 'total_classes' THEN
        v_qualifies := (
          SELECT COUNT(*) FROM check_ins WHERE member_id = p_member_id
        ) >= r.rule_threshold;

      WHEN 'streak_days' THEN
        v_qualifies := v_streak >= r.rule_threshold;

      WHEN 'modality_classes' THEN
        -- Match on the slot's modality when available, falling back to the
        -- class_name snapshot. Old check-ins predate schedule_slot_id, and the
        -- name is what the kiosk actually displayed.
        v_qualifies := (
          SELECT COUNT(*)
          FROM   check_ins ci
          LEFT   JOIN schedule_slots ss ON ss.id = ci.schedule_slot_id
          LEFT   JOIN class_modalities cm ON cm.id = ss.modality_id
          WHERE  ci.member_id = p_member_id
            AND (cm.name = r.rule_modality OR ci.class_name ILIKE '%' || r.rule_modality || '%')
        ) >= r.rule_threshold;

      WHEN 'early_bird' THEN
        v_qualifies := (
          SELECT COUNT(*)
          FROM   check_ins ci
          JOIN   schedule_slots ss ON ss.id = ci.schedule_slot_id
          WHERE  ci.member_id = p_member_id AND ss.start_time < TIME '08:00'
        ) >= r.rule_threshold;

      WHEN 'night_owl' THEN
        v_qualifies := (
          SELECT COUNT(*)
          FROM   check_ins ci
          JOIN   schedule_slots ss ON ss.id = ci.schedule_slot_id
          WHERE  ci.member_id = p_member_id AND ss.start_time >= TIME '18:00'
        ) >= r.rule_threshold;

      WHEN 'saturday_classes' THEN
        v_qualifies := (
          SELECT COUNT(*) FROM check_ins
          WHERE  member_id = p_member_id
            AND  EXTRACT(ISODOW FROM class_date) = 6
        ) >= r.rule_threshold;

      WHEN 'gi_and_nogi_week' THEN
        -- Both styles inside one ISO week, any week in history.
        v_qualifies := EXISTS (
          SELECT 1
          FROM   check_ins ci
          WHERE  ci.member_id = p_member_id
          GROUP  BY DATE_TRUNC('week', ci.class_date)
          HAVING BOOL_OR(ci.class_name ILIKE '%gi%' AND ci.class_name NOT ILIKE '%no-gi%' AND ci.class_name NOT ILIKE '%nogi%')
             AND BOOL_OR(ci.class_name ILIKE '%no-gi%' OR ci.class_name ILIKE '%nogi%')
        );

      WHEN 'perfect_month' THEN
        -- A calendar month where the member attended EVERY day the gym opened.
        -- Requires the month to be over (or be the current one up to today) and
        -- to have had at least one open day.
        v_qualifies := EXISTS (
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
        v_qualifies := false;     -- unknown rule_kind: never award, never crash
    END CASE;

    IF v_qualifies THEN
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

GRANT EXECUTE ON FUNCTION public.evaluate_member_badges(INT, DATE) TO authenticated;

-- ── Retroactive backfill ────────────────────────────────────────────────────
-- Replays existing check-ins so members who have been training for months don't
-- open the portal at level 1 with nothing. Safe to run repeatedly: award_check_in_xp
-- and evaluate_member_badges both no-op on what already exists.
--
-- Run manually after deploy:  SELECT public.backfill_gamification();

CREATE OR REPLACE FUNCTION public.backfill_gamification()
RETURNS TABLE(members_processed INT, xp_granted INT, badges_awarded INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ci          RECORD;
  m           RECORD;
  v_members   INT := 0;
  v_xp        INT := 0;
  v_badges    INT := 0;
  v_today     DATE := CURRENT_DATE;
BEGIN
  -- XP in chronological order so streak bonuses reflect history as it happened.
  FOR ci IN SELECT id FROM check_ins ORDER BY class_date ASC, checked_in_at ASC LOOP
    v_xp := v_xp + award_check_in_xp(ci.id);
  END LOOP;

  -- Then badges, once per member, with full history present.
  FOR m IN SELECT DISTINCT member_id FROM check_ins LOOP
    v_members := v_members + 1;
    v_badges  := v_badges + (
      SELECT COUNT(*)::int FROM evaluate_member_badges(m.member_id, v_today)
    );
  END LOOP;

  -- Credit past promotions and stripes from belt_history.
  INSERT INTO xp_events (member_id, points, source, description, occurred_at)
  SELECT
    bh.member_id,
    CASE WHEN bh.event_type = 'promotion' THEN 500 ELSE 150 END,
    CASE WHEN bh.event_type = 'promotion' THEN 'promotion' ELSE 'stripe' END,
    CASE WHEN bh.event_type = 'promotion'
         THEN 'Cinturón ' || bh.belt
         ELSE 'Grado ' || bh.stripes END,
    bh.promoted_at
  FROM   belt_history bh
  WHERE  bh.event_type IN ('promotion', 'stripe')
    AND  NOT EXISTS (
           SELECT 1 FROM xp_events xe
           WHERE  xe.member_id = bh.member_id
             AND  xe.source IN ('promotion', 'stripe')
             AND  xe.occurred_at = bh.promoted_at
         );

  members_processed := v_members;
  xp_granted        := v_xp;
  badges_awarded    := v_badges;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_gamification() FROM PUBLIC, anon, authenticated;
