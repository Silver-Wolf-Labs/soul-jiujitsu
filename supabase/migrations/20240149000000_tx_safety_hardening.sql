-- Hardens the transaction-safety functions introduced in 20240144..20240148:
--
-- 1) add_stripe_tx: acquire a row-level lock on the member before
--    read-modify-write so two concurrent "add stripe" calls on the same
--    member cannot both read N and both write N+1 (which would also
--    insert two belt_history rows for a single intended promotion).
--
-- 2) archived_waiver_signatures_original_id_key: the constraint add in
--    20240148000000 was not re-entrant. Wrap it in a guarded DO block so
--    a fresh clone can run the migration series from scratch even if the
--    constraint already happens to exist. Idempotent on remote (already
--    present) and safe on fresh databases.

-- ── 1) add_stripe_tx with row lock ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_stripe_tx(
  p_member_id   INT,
  p_admin_email TEXT,
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
  -- FOR UPDATE serializes concurrent add_stripe calls on the same member.
  -- Without the lock, two callers could each read stripes=N and each
  -- write N+1, losing an increment and producing two belt_history rows
  -- for a single effective promotion.
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

-- ── 2) Idempotent re-add of the archived_waiver_signatures unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'archived_waiver_signatures_original_id_key'
       AND conrelid = 'public.archived_waiver_signatures'::regclass
  ) THEN
    ALTER TABLE public.archived_waiver_signatures
      ADD CONSTRAINT archived_waiver_signatures_original_id_key UNIQUE (original_id);
  END IF;
END $$;
