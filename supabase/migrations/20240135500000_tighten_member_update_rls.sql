-- Tighten member_update_own policy to only allow safe profile fields.
-- Admin-managed fields (waiver_signed_at, belt, stripes, role, etc.)
-- can only be written by service role (which bypasses RLS entirely).

DROP POLICY IF EXISTS "member_update_own" ON public.members;

CREATE POLICY "member_update_own" ON public.members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
  );

-- Enforce column-level restriction via a trigger that prevents members from
-- modifying protected columns.
CREATE OR REPLACE FUNCTION public.prevent_member_sensitive_column_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service role (bypasses RLS, but this trigger still runs).
  -- We detect service role by checking that auth.uid() is NULL
  -- (service role calls don't set auth context).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow admins to change anything.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Reject if the member is attempting to change protected columns.
  IF NEW.belt IS DISTINCT FROM OLD.belt THEN
    RAISE EXCEPTION 'Members cannot update belt';
  END IF;
  IF NEW.stripes IS DISTINCT FROM OLD.stripes THEN
    RAISE EXCEPTION 'Members cannot update stripes';
  END IF;
  IF NEW.belt_awarded_at IS DISTINCT FROM OLD.belt_awarded_at THEN
    RAISE EXCEPTION 'Members cannot update belt_awarded_at';
  END IF;
  IF NEW.waiver_signed_at IS DISTINCT FROM OLD.waiver_signed_at THEN
    RAISE EXCEPTION 'Members cannot update waiver_signed_at';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Members cannot update role';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Members cannot update user_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_member_sensitive_update ON public.members;

CREATE TRIGGER trg_prevent_member_sensitive_update
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_member_sensitive_column_update();
