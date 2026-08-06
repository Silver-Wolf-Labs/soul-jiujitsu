-- Three RPC updates to wire up the new waiver_status column:
--
-- 1. create_member_profile_tx — also UPDATEs profiles.full_name (Fix 1) and
--    sets waiver_status on the new members row (Fix 2).
--
-- 2. sign_waiver_tx — sets waiver_status = 'signed' when the member signs
--    from the portal after signup (previously only updated waiver_signed_at).
--
-- 3. activate_waiver_template_tx — after activating a template, marks members
--    as 'pending' if they were 'not_required' or last signed an older version.

-- ── 1. create_member_profile_tx ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_member_profile_tx(
  p_user_id                        uuid,
  p_first_name                     text,
  p_last_name                      text,
  p_email                          text,
  p_phone                          text,
  p_status                         text,
  p_emergency_contact_name         text,
  p_emergency_contact_phone        text,
  p_emergency_contact_relationship text,
  p_communication_opt_in           boolean,
  p_birth_month                    int,
  p_birth_year                     int,
  p_gender                         text,
  p_belt                           text,
  p_stripes                        int,
  p_belt_awarded_at                timestamptz,
  p_training_started_at            timestamptz,
  p_waiver_template_id             int,
  p_waiver_template_version        int,
  p_waiver_snapshot_md             text,
  p_waiver_signature_type          text,
  p_waiver_typed_initials          text,
  p_waiver_signature_path          text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id bigint;
  v_new_id      bigint;
BEGIN
  -- Idempotency: if a members row already exists for this auth user,
  -- return it without re-inserting.
  SELECT id
    INTO v_existing_id
    FROM public.members
   WHERE user_id = p_user_id
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN json_build_object(
      'member_id', v_existing_id,
      'already_existed', true
    );
  END IF;

  -- Insert the member. waiver_status is set here so it is never the default
  -- 'pending' for a record that completed the signup flow:
  --   'not_required' when no waiver template was active at signup time
  --   'signed'       when the member signed a waiver during signup
  INSERT INTO public.members (
    user_id,
    first_name,
    last_name,
    email,
    phone,
    status,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relationship,
    communication_opt_in,
    birth_month,
    birth_year,
    gender,
    belt,
    stripes,
    belt_awarded_at,
    training_started_at,
    waiver_status
  ) VALUES (
    p_user_id,
    p_first_name,
    p_last_name,
    p_email,
    p_phone,
    p_status::member_status,
    p_emergency_contact_name,
    p_emergency_contact_phone,
    p_emergency_contact_relationship,
    p_communication_opt_in,
    p_birth_month,
    p_birth_year,
    p_gender,
    p_belt,
    p_stripes,
    p_belt_awarded_at,
    p_training_started_at,
    CASE WHEN p_waiver_template_id IS NOT NULL THEN 'signed' ELSE 'not_required' END
  )
  RETURNING id INTO v_new_id;

  -- Fix 1: backfill profiles.full_name. The handle_new_user() trigger creates
  -- the profiles row when auth.users is inserted (before this RPC runs) but
  -- sets full_name = NULL because raw_user_meta_data doesn't have the name yet.
  -- Update it here atomically with the member creation so it is never NULL.
  UPDATE public.profiles
     SET full_name = TRIM(CONCAT_WS(' ', p_first_name, p_last_name))
   WHERE id = p_user_id;

  -- Sign the waiver in the same transaction if one was provided.
  IF p_waiver_template_id IS NOT NULL THEN
    INSERT INTO public.waiver_signatures (
      member_id,
      template_id,
      template_version,
      snapshot_md,
      signature_type,
      typed_initials,
      signature_path
    ) VALUES (
      v_new_id,
      p_waiver_template_id,
      COALESCE(p_waiver_template_version, 1),
      COALESCE(p_waiver_snapshot_md, ''),
      p_waiver_signature_type,
      p_waiver_typed_initials,
      p_waiver_signature_path
    );

    UPDATE public.members
       SET waiver_signed_at = now()
     WHERE id = v_new_id;
  END IF;

  RETURN json_build_object(
    'member_id', v_new_id,
    'already_existed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_profile_tx(
  uuid, text, text, text, text, text, text, text, text, boolean,
  int, int, text, text, int, timestamptz, timestamptz,
  int, int, text, text, text, text
) FROM public;

GRANT EXECUTE ON FUNCTION public.create_member_profile_tx(
  uuid, text, text, text, text, text, text, text, text, boolean,
  int, int, text, text, int, timestamptz, timestamptz,
  int, int, text, text, text, text
) TO service_role;

-- ── 2. sign_waiver_tx ─────────────────────────────────────────────────────────
-- Add waiver_status = 'signed' update so portal-initiated signatures (members
-- signing after signup) keep the new column consistent.
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
     SET waiver_signed_at = now(),
         waiver_status    = 'signed'
   WHERE id = p_member_id;

  RETURN json_build_object('already_signed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.sign_waiver_tx(int, int, int, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.sign_waiver_tx(int, int, int, text, text, text, text) TO service_role;

-- ── 3. activate_waiver_template_tx ───────────────────────────────────────────
-- After activating a template, mark members as 'pending' if they have never
-- signed (not_required) or if their most recent signature was for an older
-- template version. This surfaces the "please sign the updated waiver" banner
-- in the portal for those members.
CREATE OR REPLACE FUNCTION public.activate_waiver_template_tx(
  p_template_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_version integer;
BEGIN
  -- Deactivate all and activate target atomically (unchanged logic).
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

  -- Fetch the version of the newly activated template so we can compare.
  SELECT version INTO v_new_version
    FROM public.waiver_templates
   WHERE id = p_template_id;

  -- Mark members as pending who either:
  --   a) were never required to sign (waiver_status = 'not_required'), or
  --   b) have waiver_status = 'signed' but their most recent signature is for
  --      an older template version — they need to sign the new one.
  UPDATE public.members m
     SET waiver_status = 'pending'
   WHERE m.waiver_status = 'not_required'
      OR (
        m.waiver_status = 'signed'
        AND (
          SELECT MAX(ws.template_version)
            FROM public.waiver_signatures ws
           WHERE ws.member_id = m.id
        ) < v_new_version
      );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_waiver_template_tx(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.activate_waiver_template_tx(integer) TO service_role;
