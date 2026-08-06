-- Transaction-safe member deletion with optional waiver archival.
-- Ensures archive + delete are atomic and retries are idempotent.

-- Add a unique constraint on original_id so ON CONFLICT DO NOTHING makes
-- the archive step idempotent across retries.
ALTER TABLE public.archived_waiver_signatures
  ADD CONSTRAINT archived_waiver_signatures_original_id_key UNIQUE (original_id);

CREATE OR REPLACE FUNCTION public.delete_member_tx(
  p_member_id       int,
  p_preserve_waivers boolean,
  p_archived_by     text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists        boolean;
  v_archived_count int := 0;
BEGIN
  -- Idempotency: if the member row is gone, report not_found.
  SELECT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id)
    INTO v_exists;

  IF NOT v_exists THEN
    RETURN json_build_object('deleted', false, 'reason', 'not_found');
  END IF;

  -- Archive waiver signatures (denormalized with member name/email)
  IF p_preserve_waivers THEN
    WITH inserted AS (
      INSERT INTO public.archived_waiver_signatures (
        original_id,
        member_id,
        member_name,
        member_email,
        template_id,
        template_version,
        signed_at,
        ip_address,
        snapshot_md,
        signature_type,
        typed_initials,
        signature_path,
        archived_by
      )
      SELECT
        ws.id,
        ws.member_id,
        m.first_name || ' ' || m.last_name,
        m.email,
        ws.template_id,
        ws.template_version,
        ws.signed_at,
        ws.ip_address,
        ws.snapshot_md,
        ws.signature_type,
        ws.typed_initials,
        ws.signature_path,
        p_archived_by
      FROM public.waiver_signatures ws
      JOIN public.members m ON m.id = ws.member_id
      WHERE ws.member_id = p_member_id
      ON CONFLICT (original_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_archived_count FROM inserted;
  END IF;

  -- Delete the member row. CASCADE handles member_memberships,
  -- member_purchases, check_ins, belt_history, waiver_signatures.
  DELETE FROM public.members WHERE id = p_member_id;

  RETURN json_build_object('deleted', true, 'archived_count', v_archived_count);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_member_tx(int, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_member_tx(int, boolean, text) TO service_role;
