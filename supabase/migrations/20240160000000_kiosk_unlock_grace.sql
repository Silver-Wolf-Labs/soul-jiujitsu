-- Kiosk: seed the unlock-grace policy.
--
-- Default is "strict" — the kiosk demands a fresh PIN on every refresh
-- (original behavior). An admin can loosen this from /admin/kiosk to
-- "4h", "8h", or "16h", at which point a `kiosk_grace_until` cookie
-- absorbs refreshes until the window elapses.
--
-- Parsed in `src/lib/kiosk-ui-config.ts` :: parseUnlockGrace — any value
-- outside {strict, 4h, 8h, 16h} falls back to "strict".

INSERT INTO site_settings (key, value) VALUES ('kiosk_unlock_grace', 'strict')
  ON CONFLICT (key) DO NOTHING;
