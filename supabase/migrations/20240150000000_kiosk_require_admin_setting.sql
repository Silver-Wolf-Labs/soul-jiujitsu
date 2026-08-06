-- Kiosk: add a "require admin session to unlock" toggle.
--
-- Default is "true" — an operator must consciously relax this setting
-- before an anonymous user can enter the PIN and unlock the kiosk.
-- The check is enforced in lib/actions/check-ins.ts :: unlockKiosk.
--
-- Stored in site_settings as a string so the toggle UI can upsert it
-- alongside the other kiosk keys without needing a typed schema.

INSERT INTO site_settings (key, value) VALUES ('kiosk_require_admin', 'true')
  ON CONFLICT (key) DO NOTHING;
