-- ─────────────────────────────────────────────────────────────────────────────
-- Restrict anon/authenticated SELECT on site_settings for kiosk secrets.
--
-- Background: `site_settings` stores the gym's entire config (name, hours,
-- theme, etc.) AND two secrets — `kiosk_pin` and `kiosk_session_token`.
-- The original public_read_settings policy used `USING (true)` which meant
-- anyone with the anon key (publicly shipped in the client bundle) could
-- read those secrets directly via the REST API:
--
--     curl $SUPABASE_URL/rest/v1/site_settings?key=eq.kiosk_pin \
--          -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--
-- That would leak both the PIN (letting anyone unlock the kiosk) and the
-- current session token (letting anyone impersonate an active kiosk).
--
-- This migration tightens the SELECT policy to exclude those two keys from
-- public reads, and introduces a SECURITY DEFINER RPC `verify_kiosk_token`
-- so middleware can still validate the token without reading its value.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tighten SELECT policy ─────────────────────────────────────────────────────
-- Replace blanket `USING (true)` with an exclusion list.  `TO public` grants
-- both anon AND authenticated roles (subject to the exclusion).  Admin reads
-- are already covered by `admin_write_settings` (FOR ALL) — RLS policies OR
-- together, so admins will continue to see every key including the secrets.
DROP POLICY IF EXISTS "public_read_settings" ON site_settings;
DROP POLICY IF EXISTS "public_read_settings_non_secret" ON site_settings;

CREATE POLICY "public_read_settings_non_secret"
  ON site_settings FOR SELECT TO public
  USING (key NOT IN ('kiosk_pin', 'kiosk_session_token'));

-- ── verify_kiosk_token RPC ────────────────────────────────────────────────────
-- Lets the middleware answer "is this cookie value the current token?" without
-- needing to read the token value.  Returns TRUE only on exact match against
-- a non-empty stored token.
CREATE OR REPLACE FUNCTION public.verify_kiosk_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM site_settings
    WHERE key   = 'kiosk_session_token'
      AND value = p_token
      AND value <> ''
  )
$$;

GRANT EXECUTE ON FUNCTION public.verify_kiosk_token(TEXT) TO anon, authenticated;
