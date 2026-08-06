-- ============================================================================
-- belt_history: richer metadata + white-belt belt_awarded handling
-- ----------------------------------------------------------------------------
-- Three changes in one migration:
--
-- 1. Add `belt_history.promoted_by_name` so the UI can display "by Jane Doe"
--    without looking up profiles at render time. Email stays in
--    `promoted_by` for compatibility; name is captured at write-time so it
--    survives the admin leaving the gym or changing their name.
--
-- 2. Update promote_member_tx, add_stripe_tx, correct_belt_tx, and
--    update_member_belt_details_tx to accept an admin name parameter and
--    write it into the new column. The update_member_belt_details_tx RPC
--    also gains a `p_event_type` argument so the admin can flag the change
--    as 'promotion', 'stripe', or 'correction' from the full-edit modal.
--
-- 3. Normalize belt_awarded_at=NULL when belt='white'. White belt has no
--    awarding ceremony; storing a date there is misleading.  Both RPCs that
--    write belt_awarded_at now set it to NULL whenever the target belt is
--    'white', regardless of what the caller supplied.
-- ============================================================================

-- ── 1) Column add ────────────────────────────────────────────────────────────
ALTER TABLE public.belt_history
  ADD COLUMN IF NOT EXISTS promoted_by_name TEXT;

-- ── 2a) promote_member_tx: add p_admin_name ─────────────────────────────────
-- Drop first so the signature can change. The previous grant referenced
-- (INT, TEXT, TEXT, TEXT); the new one is (INT, TEXT, TEXT, TEXT, TEXT).
DROP FUNCTION IF EXISTS public.promote_member_tx(INT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.promote_member_tx(
  p_member_id   INT,
  p_new_belt    TEXT,
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

  UPDATE public.members
     SET belt            = p_new_belt,
         stripes         = 0,
         -- White belt has no awarding event; null the column so display
         -- code can skip "Current belt since:" for white members.
         belt_awarded_at = CASE WHEN p_new_belt = 'white' THEN NULL ELSE now() END
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
    p_new_belt,
    0,
    'promotion',
    p_note,
    p_admin_email,
    p_admin_name
  );

  RETURN json_build_object(
    'id',      v_updated_id,
    'belt',    p_new_belt,
    'stripes', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promote_member_tx(INT, TEXT, TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.promote_member_tx(INT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ── 2b) add_stripe_tx: add p_admin_name ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_stripe_tx(INT, TEXT, TEXT);

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

REVOKE ALL ON FUNCTION public.add_stripe_tx(INT, TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.add_stripe_tx(INT, TEXT, TEXT, TEXT) TO service_role;

-- ── 2c) update_member_belt_details_tx: add p_admin_name + p_event_type ──────
-- Also null belt_awarded_at for white belt regardless of caller input.
DROP FUNCTION IF EXISTS public.update_member_belt_details_tx(
  INT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
);

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
BEGIN
  -- Gate event_type so a typo doesn't land an unknown tag.
  IF p_event_type IS NULL OR p_event_type NOT IN ('promotion','stripe','correction') THEN
    v_effective_event := 'correction';
  ELSE
    v_effective_event := p_event_type;
  END IF;

  -- White belt never has an awarded date. For any other belt, use the
  -- caller's date when provided and fall back to the existing value.
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

REVOKE ALL ON FUNCTION public.update_member_belt_details_tx(
  INT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT
) FROM public;
GRANT EXECUTE ON FUNCTION public.update_member_belt_details_tx(
  INT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- ── 3) Backfill: null out belt_awarded_at for any existing white-belt members
-- Safe one-shot update — no-op on systems where the rule already holds.
UPDATE public.members
   SET belt_awarded_at = NULL
 WHERE belt = 'white'
   AND belt_awarded_at IS NOT NULL;
