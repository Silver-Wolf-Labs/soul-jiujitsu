-- Waiver transaction safety: wrap multi-step waiver operations in atomic
-- Postgres functions so partial writes cannot leave the system in an
-- inconsistent state.
--
-- 1) activate_waiver_template_tx: deactivate all templates and activate one
--    target template inside a single transaction. Previously this was two
--    sequential UPDATEs from the client, which could leave zero templates
--    active if the second UPDATE failed.
--
-- 2) sign_waiver_tx: insert the waiver_signatures row and update
--    members.waiver_signed_at atomically, with an idempotency check so
--    retries do not produce duplicate signature rows.

-- ── activate_waiver_template_tx ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_waiver_template_tx(
  p_template_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Single statement CTE: deactivate everything, then activate the target.
  -- Both UPDATEs run in one statement so there is no intermediate state
  -- where zero templates are active.
  WITH deactivated AS (
    UPDATE public.waiver_templates
       SET active = false
     WHERE active = true
       AND id <> p_template_id
    RETURNING id
  )
  UPDATE public.waiver_templates
     SET active = true
   WHERE id = p_template_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_waiver_template_tx(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.activate_waiver_template_tx(integer) TO service_role;

-- ── sign_waiver_tx ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sign_waiver_tx(
  p_member_id         int,
  p_template_id       int,
  p_template_version  int,
  p_snapshot_md       text,
  p_signature_type    text,
  p_typed_initials    text,
  p_signature_path    text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id bigint;
BEGIN
  -- Idempotency: if a signature already exists for this (member, template,
  -- version) tuple, do nothing and tell the caller.
  SELECT id
    INTO v_existing_id
    FROM public.waiver_signatures
   WHERE member_id = p_member_id
     AND template_id = p_template_id
     AND template_version = p_template_version
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN json_build_object('already_signed', true);
  END IF;

  INSERT INTO public.waiver_signatures (
    member_id,
    template_id,
    template_version,
    snapshot_md,
    signature_type,
    typed_initials,
    signature_path
  ) VALUES (
    p_member_id,
    p_template_id,
    p_template_version,
    p_snapshot_md,
    p_signature_type,
    p_typed_initials,
    p_signature_path
  );

  UPDATE public.members
     SET waiver_signed_at = now()
   WHERE id = p_member_id;

  RETURN json_build_object('already_signed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.sign_waiver_tx(int, int, int, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.sign_waiver_tx(int, int, int, text, text, text, text) TO service_role;
