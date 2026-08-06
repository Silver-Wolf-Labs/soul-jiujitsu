-- Admin security: hard cap on admin session lifetime before forced re-auth.
--
-- Default is "1h" — matches Supabase's access-token lifetime so the hard
-- ceiling naturally aligns with the refresh cycle. Admins can widen this
-- to 4h / 8h / 16h from /admin/settings, or tighten to 15m for paranoid
-- setups.
--
-- Enforced in the client via `AdminSessionGuard` (wraps SessionWarning).
-- Orthogonal to the 30 min idle timeout, which stays hard-coded.
--
-- Parsed in `src/lib/admin-session-config.ts` :: parseAdminSessionTtl —
-- any value outside {15m, 1h, 4h, 8h, 16h} falls back to "1h".

INSERT INTO site_settings (key, value) VALUES ('admin_session_ttl', '1h')
  ON CONFLICT (key) DO NOTHING;
