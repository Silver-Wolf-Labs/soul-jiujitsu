-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Admin Hardening
--
-- Upgrades all write policies from "any authenticated user" to
-- "authenticated user where is_admin = true in profiles".
--
-- Safe to re-run (uses DROP IF EXISTS + CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper function ───────────────────────────────────────────────────────────
-- Reusable admin check used in every policy below.
-- SECURITY DEFINER so it can read profiles without an infinite RLS loop.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
$$;

-- ── site_settings ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_write_settings" ON site_settings;
CREATE POLICY "admin_write_settings" ON site_settings
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── updates ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_updates" ON updates;
CREATE POLICY "admin_all_updates" ON updates
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── schedule ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_schedule" ON schedule;
CREATE POLICY "admin_all_schedule" ON schedule
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── team ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_team" ON team;
CREATE POLICY "admin_all_team" ON team
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── blog_posts ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_blog" ON blog_posts;
CREATE POLICY "admin_all_blog" ON blog_posts
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── subscribers ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_subscribers" ON subscribers;
CREATE POLICY "admin_all_subscribers" ON subscribers
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── contact_submissions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_contacts" ON contact_submissions;
CREATE POLICY "admin_all_contacts" ON contact_submissions
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── pricing_plans ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage pricing plans" ON pricing_plans;
CREATE POLICY "admin_all_pricing" ON pricing_plans
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── faq_items ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage faq items" ON faq_items;
CREATE POLICY "admin_all_faq" ON faq_items
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── site_sections ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auth all site_sections" ON site_sections;
DROP POLICY IF EXISTS "admin_all_sections" ON site_sections;
CREATE POLICY "admin_all_sections" ON site_sections
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── banners ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage banners" ON banners;
DROP POLICY IF EXISTS "admin_all_banners" ON banners;
CREATE POLICY "admin_all_banners" ON banners
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
