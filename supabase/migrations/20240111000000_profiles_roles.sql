-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0.3 — Profiles + Role Model
--
-- Expands the thin profiles table into a canonical identity/roles model.
-- Adds: role enum, full_name, email (denormalized), auto-create trigger,
-- has_role() helper, updated is_admin() to check role column.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add role + identity fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'staff', 'member')),
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Migrate existing admins: is_admin = true → role = 'admin'
UPDATE public.profiles SET role = 'admin' WHERE is_admin = true AND role = 'member';

-- 3. Auto-create profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'member'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Update is_admin() — now checks role column first, falls back to boolean
--    for backward compatibility with existing rows
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_admin = true)
  )
$$;

-- 5. Add has_role() for future staff/role checks
CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role = required_role
        OR (required_role = 'admin' AND is_admin = true)
      )
  )
$$;

-- 6. Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
