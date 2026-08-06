-- ============================================================================
-- Black belt: up to 6 stripes
-- ----------------------------------------------------------------------------
-- BJJ black belts earn 6 "degrees" (stripes) that continue the promotion
-- ladder after receiving the belt — 1st through 6th degree are still part
-- of the normal coral-progression path. Colored belts still cap at 4.
--
-- Changes:
--   * Relax the stripes CHECK on members + belt_history to
--     0..6 when belt='black', 0..4 otherwise.
--   * Update add_stripe_tx to allow the 5th and 6th stripe on black belt.
--   * Update update_member_belt_details_tx to enforce the same per-belt
--     ceiling (and return a clearer error than the CHECK constraint).
--
-- No data migration needed — any existing black belt at 4 stripes is still
-- within the new bounds; the new bounds are a superset of the old ones.
-- ============================================================================

-- ── members.stripes ─────────────────────────────────────────────────────────
ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_stripes_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_stripes_check
  CHECK (
    stripes >= 0
    AND stripes <= CASE WHEN belt = 'black' THEN 6 ELSE 4 END
  );

COMMENT ON COLUMN public.members.stripes IS
  'Number of stripes on current belt. Colored belts: 0-4. Black belt: 0-6.';

-- ── belt_history.stripes ────────────────────────────────────────────────────
ALTER TABLE public.belt_history
  DROP CONSTRAINT IF EXISTS belt_history_stripes_check;

ALTER TABLE public.belt_history
  ADD CONSTRAINT belt_history_stripes_check
  CHECK (
    stripes >= 0
    AND stripes <= CASE WHEN belt = 'black' THEN 6 ELSE 4 END
  );

-- ── add_stripe_tx: per-belt ceiling ─────────────────────────────────────────
-- Signature unchanged; semantics: cap at 6 for black, 4 otherwise.
CREATE OR REPLACE FUNCTION public.add_stripe_tx(
  p_member_id   INT,
  p_admin_email TEXT,
  p_admin_name  TEXT,
  p_note        TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_belt    TEXT;
  v_current_stripes INT;
  v_max_stripes     INT;
  v_new_stripes     INT;
  v_updated_id      INT;
BEGIN
  SELECT belt, COALESCE(stripes, 0)
    INTO v_current_belt, v_current_stripes
    FROM public.members
   WHERE id = p_member_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  v_max_stripes := CASE WHEN COALESCE(v_current_belt, 'white') = 'black' THEN 6 ELSE 4 END;

  IF v_current_stripes >= v_max_stripes THEN
    RAISE EXCEPTION 'Already at maximum stripes (%) for % belt',
      v_max_stripes, COALESCE(v_current_belt, 'white');
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
    promoted_by,
    promoted_by_name
  ) VALUES (
    p_member_id,
    COALESCE(v_current_belt, 'white'),
    v_new_stripes,
    'stripe',
    p_note,
    p_admin_email,
    p_admin_name
  );

  RETURN json_build_object(
    'id',      v_updated_id,
    'belt',    COALESCE(v_current_belt, 'white'),
    'stripes', v_new_stripes
  );
END;
$$;

-- ── update_member_belt_details_tx: validate belt/stripes pair ───────────────
-- Same signature as 20240156; adds a belt-specific stripe-ceiling check
-- before the UPDATE so we surface a readable error instead of letting the
-- CHECK constraint fire with a raw pg message.
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

  v_max_stripes := CASE WHEN p_new_belt = 'black' THEN 6 ELSE 4 END;
  IF p_new_stripes < 0 OR p_new_stripes > v_max_stripes THEN
    RAISE EXCEPTION 'Invalid stripe count % for % belt (allowed 0..%)',
      p_new_stripes, p_new_belt, v_max_stripes;
  END IF;

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
    COALESCE(v_belt_awarded, now())
  );

  RETURN json_build_object(
    'id',         v_updated_id,
    'belt',       v_updated_belt,
    'stripes',    v_updated_stripes,
    'event_type', v_effective_event
  );
END;
$$;
