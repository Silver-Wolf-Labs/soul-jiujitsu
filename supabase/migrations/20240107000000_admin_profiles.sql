-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Profiles
--
-- Adds an explicit is_admin flag so authorization is not based solely on
-- "any authenticated user". Only profiles with is_admin = true can access
-- the CMS. All existing users are backfilled as admins (safe for
-- single-operator setup). New signups default to is_admin = false.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Each user can read their own profile (used by middleware and layout)
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Only existing admins can promote other users
CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Auto-create a non-admin profile for every new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, is_admin)
  VALUES (new.id, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill: all users currently in auth.users are legitimate admins.
-- Remove or adjust this if you ever add non-admin user roles.
INSERT INTO profiles (id, is_admin)
SELECT id, true FROM auth.users
ON CONFLICT (id) DO UPDATE SET is_admin = true;
