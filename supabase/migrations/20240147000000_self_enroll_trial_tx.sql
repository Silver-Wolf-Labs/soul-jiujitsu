-- Atomic self-enrollment trial transaction.
-- Ensures that creating a trialing member_memberships row and updating
-- members.status = 'trial' happen as a single unit, so the trial branch
-- of selfEnrollInPlan cannot leave the DB in an inconsistent state.

CREATE OR REPLACE FUNCTION enroll_trial_membership_tx(
  p_member_id int,
  p_plan_id int,
  p_locked_price_cents int,
  p_plan_name text,
  p_plan_billing_interval text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id int;
  v_new_id int;
BEGIN
  -- Idempotency: bail out if there's already an active-ish membership.
  SELECT id INTO v_existing_id
  FROM member_memberships
  WHERE member_id = p_member_id
    AND status IN ('active', 'trialing', 'paused', 'past_due')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN json_build_object('error', 'already_enrolled');
  END IF;

  INSERT INTO member_memberships (
    member_id,
    plan_id,
    status,
    started_at,
    locked_price_cents,
    plan_name,
    plan_billing_interval
  ) VALUES (
    p_member_id,
    p_plan_id,
    'trialing',
    now(),
    p_locked_price_cents,
    p_plan_name,
    p_plan_billing_interval
  )
  RETURNING id INTO v_new_id;

  UPDATE members
  SET status = 'trial'
  WHERE id = p_member_id;

  RETURN json_build_object('membership_id', v_new_id, 'error', null);
END;
$$;

REVOKE ALL ON FUNCTION enroll_trial_membership_tx(int, int, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION enroll_trial_membership_tx(int, int, int, text, text) TO service_role;
