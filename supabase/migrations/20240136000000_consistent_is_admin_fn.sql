-- ─────────────────────────────────────────────────────────────────────────────
-- Consistent is_admin() usage
--
-- Several earlier migrations used inline
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
-- instead of the reusable public.is_admin() helper created in
-- 20240108_rls_admin_hardening. This migration rewrites those policies
-- to call is_admin() for consistency and single-point-of-change.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── check_ins (from 20240129) ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage check_ins" ON public.check_ins;
CREATE POLICY "Admins manage check_ins" ON public.check_ins
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── member_purchases (from 20240120) ─────────────────────────────────────────
DROP POLICY IF EXISTS "Admin full access on member_purchases" ON public.member_purchases;
CREATE POLICY "Admin full access on member_purchases" ON public.member_purchases
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── waiver_templates (from 20240131) ─────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_waiver_templates" ON public.waiver_templates;
CREATE POLICY "admin_all_waiver_templates" ON public.waiver_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── waiver_signatures (from 20240131) ────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_waiver_signatures" ON public.waiver_signatures;
CREATE POLICY "admin_all_waiver_signatures" ON public.waiver_signatures
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── storage: signature files (from 20240133) ─────────────────────────────────
DROP POLICY IF EXISTS "admin_read_signature_files" ON storage.objects;
CREATE POLICY "admin_read_signature_files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND public.is_admin()
  );

-- ── profiles update (from 20240107) ──────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin());
