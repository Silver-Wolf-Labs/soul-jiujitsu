-- ============================================================================
-- Fix: belt_history.promoted_at should always be now() for full-edit saves
-- ----------------------------------------------------------------------------
-- 20240155/156/157 versions of update_member_belt_details_tx inserted
-- belt_history rows with promoted_at = COALESCE(v_belt_awarded, now()).
-- When the admin left the Belt Awarded date alone (i.e. sent the existing
-- value back through the form), the new row inherited the member's
-- potentially-old belt_awarded_at and sorted below newer quick-action
-- entries in the timeline — which is ordered by promoted_at DESC.
--
-- The member's effective "belt earned on" date already lives in
-- `members.belt_awarded_at`. `belt_history.promoted_at` is the audit
-- timestamp of when the admin recorded the change and should always
-- reflect that moment, so new entries naturally land at the top of the
-- timeline.
--
-- Also: enforce the per-belt stripe ceiling here (matches 20240157) so
-- this migration is safe to apply whether or not 20240157 landed first.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_member_belt_details_tx(
  p_member_id           INT,
  p_new_belt            TEXT,
  p_new_stripes         INT,
  p_belt_awarded_at     TIMESTAMPTZ,
  p_training_started_at TIMESTAMPTZ,
  p_event_type          TEXT,
  p_admin_email         TEXT,
  p_admin_name          TEXT,
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
  v_effective_event TEXT;
  v_belt_awarded    TIMESTAMPTZ;
  v_max_stripes     INT;
BEGIN
  IF p_event_type IS NULL OR p_event_type NOT IN ('promotion','stripe','correction') THEN
    v_effective_event := 'correction';
  ELSE
    v_effective_event := p_event_type;
  END IF;

  -- Black belts take up to 6 degrees; colored belts cap at 4. Surface a
  -- readable error before the CHECK constraint fires.
  v_max_stripes := CASE WHEN p_new_belt = 'black' THEN 6 ELSE 4 END;
  IF p_new_stripes < 0 OR p_new_stripes > v_max_stripes THEN
    RAISE EXCEPTION 'Invalid stripe count % for % belt (allowed 0..%)',
      p_new_stripes, p_new_belt, v_max_stripes;
  END IF;

  -- White belt never carries an awarded date.
  IF p_new_belt = 'white' THEN
    v_belt_awarded := NULL;
  ELSE
    v_belt_awarded := p_belt_awarded_at;
  END IF;

  UPDATE public.members
     SET belt                = p_new_belt,
         stripes             = p_new_stripes,
         belt_awarded_at     = CASE
                                 WHEN p_new_belt = 'white' THEN NULL
                                 ELSE COALESCE(v_belt_awarded, belt_awarded_at)
                               END,
         training_started_at = COALESCE(p_training_started_at, training_started_at)
   WHERE id = p_member_id
  RETURNING id, belt, stripes
      INTO v_updated_id, v_updated_belt, v_updated_stripes;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  -- promoted_at is the audit timestamp, not the belt's effective date.
  -- Always now() so new entries land at the top of the timeline.
  INSERT INTO public.belt_history (
    member_id,
    belt,
    stripes,
    event_type,
    notes,
    promoted_by,
    promoted_by_name,
    promoted_at
  ) VALUES (
    p_member_id,
    p_new_belt,
    p_new_stripes,
    v_effective_event,
    p_note,
    p_admin_email,
    p_admin_name,
    now()
  );

  RETURN json_build_object(
    'id',         v_updated_id,
    'belt',       v_updated_belt,
    'stripes',    v_updated_stripes,
    'event_type', v_effective_event
  );
END;
$$;
