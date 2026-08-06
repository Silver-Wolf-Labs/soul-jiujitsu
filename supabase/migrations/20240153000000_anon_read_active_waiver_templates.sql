-- Allow anonymous (unauthenticated) users to read active waiver templates.
-- The signup page is viewed before auth exists, and the waiver is a
-- public-facing legal document that must be readable before a user can sign up.
CREATE POLICY "anon_read_active_waiver_templates" ON public.waiver_templates
  FOR SELECT TO anon
  USING (active = true);
