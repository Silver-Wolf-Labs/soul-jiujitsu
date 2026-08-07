-- ─────────────────────────────────────────────────────────────────────────────
-- Manual badge awarding — the professor's half of the feature.
--
-- Why an RPC instead of letting the admin UI INSERT into member_badges: the
-- badge row and its xp_events ledger row have to be written together. A plain
-- INSERT would give the member the badge but zero XP, so a hand-awarded badge
-- would be worth less than an automatic one — exactly backwards, since the
-- hand-awarded ones are the meaningful ones.
--
-- Revoking is included because a mis-clicked award needs to be undoable, and
-- undoing it must claw back the XP too or the ledger drifts.
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP first: CREATE OR REPLACE cannot change a function's OUT-parameter row
-- type, so replacing this signature in place fails with 42P13.
DROP FUNCTION IF EXISTS public.award_badge_manually(INT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.award_badge_manually(
  p_member_id  INT,
  p_badge_slug TEXT,
  p_awarded_by TEXT,          -- admin email, captured at write time
  p_note       TEXT DEFAULT NULL
)
-- Output names are prefixed `awarded_` rather than reusing `badge_id`: an OUT
-- parameter named after a real column makes the ON CONFLICT target below
-- ambiguous, and plpgsql rejects the whole function at runtime.
RETURNS TABLE(awarded_badge_id INT, awarded_badge_name TEXT, xp_awarded INT, already_had BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  SELECT id, name, xp_reward INTO b
  FROM   badges WHERE slug = p_badge_slug AND active = true;

  IF b.id IS NULL THEN
    RAISE EXCEPTION 'Unknown or inactive badge: %', p_badge_slug;
  END IF;

  INSERT INTO member_badges (member_id, badge_id, awarded_via, awarded_by, note)
  VALUES (p_member_id, b.id, 'manual', p_awarded_by, NULLIF(TRIM(p_note), ''))
  ON CONFLICT (member_id, badge_id) DO NOTHING;

  IF NOT FOUND THEN
    -- Already earned (possibly automatically). Report it rather than raising:
    -- the profe wants to know, not to see an error dialog.
    RETURN QUERY SELECT b.id, b.name, 0, true;
    RETURN;
  END IF;

  INSERT INTO xp_events (member_id, points, source, description, badge_id)
  VALUES (p_member_id, b.xp_reward, 'badge', b.name, b.id);

  RETURN QUERY SELECT b.id, b.name, b.xp_reward, false;
END;
$$;

REVOKE ALL ON FUNCTION public.award_badge_manually(INT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_badge_manually(INT, TEXT, TEXT, TEXT) TO service_role;

-- ── Revoke ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_member_badge(
  p_member_id INT,
  p_badge_id  INT
)
RETURNS BOOLEAN                 -- true if something was actually removed
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM member_badges
  WHERE member_id = p_member_id AND badge_id = p_badge_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RETURN false;
  END IF;

  -- Claw back the XP. The badge_id FK on xp_events is ON DELETE SET NULL rather
  -- than CASCADE (deleting a badge from the catalogue shouldn't rewrite history),
  -- so the ledger row has to be removed explicitly here.
  DELETE FROM xp_events
  WHERE member_id = p_member_id AND badge_id = p_badge_id AND source = 'badge';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_member_badge(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_member_badge(INT, INT) TO service_role;
