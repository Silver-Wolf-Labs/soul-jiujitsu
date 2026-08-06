-- Member profile transaction safety: wrap the multi-step member-creation
-- flow (members INSERT + optional waiver signature + waiver_signed_at
-- update) into a single atomic Postgres function so partial writes cannot
-- leave an orphaned auth.users row with no corresponding members row.
--
-- Previously the signup flow did:
--   1. INSERT into members
--   2. If that succeeded, INSERT into waiver_signatures
--   3. If that succeeded, UPDATE members.waiver_signed_at
-- Each step was a separate round-trip, and the only compensation for a
-- failed members INSERT was a best-effort auth.admin.deleteUser() call
-- that could itself fail silently, leaving an orphaned auth user.
--
-- create_member_profile_tx runs all three writes inside one transaction
-- and is idempotent on p_user_id so retries are safe.

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
  -- return it without re-inserting. This makes retries after a transient
  -- network failure safe — the client can call this RPC again and get the
  -- same member back.
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

  -- Insert the member. Column list must match the TypeScript caller
  -- exactly — do not add or remove fields here without updating
  -- createMemberProfile in src/lib/actions/auth.ts.
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
    training_started_at
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
    p_training_started_at
  )
  RETURNING id INTO v_new_id;

  -- Sign the waiver in the same transaction if one was provided. If any
  -- of these statements fail the whole transaction is rolled back,
  -- including the members insert above, so the caller can cleanly
  -- compensate the auth user.
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
