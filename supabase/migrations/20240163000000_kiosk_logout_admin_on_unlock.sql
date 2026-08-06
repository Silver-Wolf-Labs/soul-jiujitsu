-- Kiosk: seed the "sign out admin on unlock" toggle.
--
-- Default is "true" — recommended for a shared front-desk tablet so staff
-- can't navigate out of the kiosk to /admin using the admin's still-active
-- session. Admins doing setup or development on their own device can flip
-- it off from /admin/kiosk to keep their session alive across unlocks.
--
-- Parsed in `src/lib/actions/check-ins.ts` :: unlockKiosk — any value other
-- than a literal "false" keeps the safer sign-out-after-unlock behavior.

INSERT INTO site_settings (key, value) VALUES ('kiosk_logout_admin_on_unlock', 'true')
  ON CONFLICT (key) DO NOTHING;
