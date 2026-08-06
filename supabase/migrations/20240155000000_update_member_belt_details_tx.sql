-- ============================================================================
-- update_member_belt_details_tx
-- ----------------------------------------------------------------------------
-- Admin-facing "full belt detail edit" from the member detail page.
--
-- Unlike correct_belt_tx (which hard-codes belt_awarded_at to now()), this
-- function lets the admin supply specific belt_awarded_at / training_started_at
-- values — matching the signup flow's Training & Rank fields.  Writes the new
-- belt/stripes plus optional dates to members and records a `correction`
-- entry in belt_history, all in one transaction.
--
-- Nullable date parameters mean "leave the existing value alone" — this keeps
-- the caller from having to re-send a value it didn't intend to change.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_member_belt_details_tx(
  p_member_id           INT,
  p_new_belt            TEXT,
  p_new_stripes         INT,
  p_belt_awarded_at     TIMESTAMPTZ,
  p_training_started_at TIMESTAMPTZ,
  p_admin_email         TEXT,
  p_note                TEXT
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
  -- COALESCE keeps the existing column values when the caller passes NULL.
  UPDATE public.members
     SET belt                = p_new_belt,
         stripes             = p_new_stripes,
         belt_awarded_at     = COALESCE(p_belt_awarded_at, belt_awarded_at),
         training_started_at = COALESCE(p_training_started_at, training_started_at)
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
    promoted_by,
    promoted_at
  ) VALUES (
    p_member_id,
    p_new_belt,
    p_new_stripes,
    'correction',
    p_note,
    p_admin_email,
    COALESCE(p_belt_awarded_at, now())
  );

  RETURN json_build_object(
    'id',      v_updated_id,
    'belt',    v_updated_belt,
    'stripes', v_updated_stripes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_belt_details_tx(
  INT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
) FROM public;
GRANT EXECUTE ON FUNCTION public.update_member_belt_details_tx(
  INT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;
