-- Transaction safety for belt promotions, stripe additions, and belt corrections.
-- Wraps the members UPDATE + belt_history INSERT pairs into atomic Postgres
-- functions so that a failed history insert rolls back the member update.

-- ============================================================================
-- promote_member_tx
-- Updates members.belt/stripes/belt_awarded_at and inserts a belt_history
-- row with event_type = 'promotion'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.promote_member_tx(
  p_member_id     INT,
  p_new_belt      TEXT,
  p_admin_email   TEXT,
  p_note          TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id      INT;
  v_updated_belt    TEXT;
  v_updated_stripes INT;
BEGIN
  UPDATE public.members
     SET belt            = p_new_belt,
         stripes         = 0,
         belt_awarded_at = now()
   WHERE id = p_member_id
  RETURNING id, belt, stripes
      INTO v_updated_id, v_updated_belt, v_updated_stripes;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  INSERT INTO public.belt_history (
    member_id,
    belt,
    stripes,
    event_type,
    notes,
    promoted_by
  ) VALUES (
    p_member_id,
    p_new_belt,
    0,
    'promotion',
    p_note,
    p_admin_email
  );

  RETURN json_build_object(
    'id',      v_updated_id,
    'belt',    v_updated_belt,
    'stripes', v_updated_stripes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promote_member_tx(INT, TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.promote_member_tx(INT, TEXT, TEXT, TEXT) TO service_role;


-- ============================================================================
-- add_stripe_tx
-- Increments members.stripes (capped at 4) and inserts a belt_history row
-- with event_type = 'stripe'. Errors if the member is already at 4 stripes.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_stripe_tx(
  p_member_id     INT,
  p_admin_email   TEXT,
  p_note          TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_belt    TEXT;
  v_current_stripes INT;
  v_new_stripes     INT;
  v_updated_id      INT;
BEGIN
  SELECT belt, COALESCE(stripes, 0)
    INTO v_current_belt, v_current_stripes
    FROM public.members
   WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  IF v_current_stripes >= 4 THEN
    RAISE EXCEPTION 'Already at maximum stripes (4)';
  END IF;

  v_new_stripes := v_current_stripes + 1;

  UPDATE public.members
     SET stripes = v_new_stripes
   WHERE id = p_member_id
  RETURNING id INTO v_updated_id;

  INSERT INTO public.belt_history (
    member_id,
    belt,
    stripes,
    event_type,
    notes,
    promoted_by
  ) VALUES (
    p_member_id,
    COALESCE(v_current_belt, 'white'),
    v_new_stripes,
    'stripe',
    p_note,
    p_admin_email
  );

  RETURN json_build_object(
    'id',      v_updated_id,
    'belt',    COALESCE(v_current_belt, 'white'),
    'stripes', v_new_stripes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_stripe_tx(INT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.add_stripe_tx(INT, TEXT, TEXT) TO service_role;


-- ============================================================================
-- correct_belt_tx
-- Manually sets belt/stripes/belt_awarded_at and inserts a belt_history row
-- with event_type = 'correction'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.correct_belt_tx(
  p_member_id     INT,
  p_new_belt      TEXT,
  p_new_stripes   INT,
  p_admin_email   TEXT,
  p_note          TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id      INT;
  v_updated_belt    TEXT;
  v_updated_stripes INT;
BEGIN
  UPDATE public.members
     SET belt            = p_new_belt,
         stripes         = p_new_stripes,
         belt_awarded_at = now()
   WHERE id = p_member_id
  RETURNING id, belt, stripes
      INTO v_updated_id, v_updated_belt, v_updated_stripes;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  INSERT INTO public.belt_history (
    member_id,
    belt,
    stripes,
    event_type,
    notes,
    promoted_by
  ) VALUES (
    p_member_id,
    p_new_belt,
    p_new_stripes,
    'correction',
    p_note,
    p_admin_email
  );

  RETURN json_build_object(
    'id',      v_updated_id,
    'belt',    v_updated_belt,
    'stripes', v_updated_stripes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correct_belt_tx(INT, TEXT, INT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.correct_belt_tx(INT, TEXT, INT, TEXT, TEXT) TO service_role;
