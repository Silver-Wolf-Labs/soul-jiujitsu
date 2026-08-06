-- Kiosk: seed the privacy-mask toggle.
--
-- When this key is "true" (default) or missing, typed PIN digits mask to a
-- filled circle ~500 ms after a keypress, with only the newest digit briefly
-- revealed. Admins can flip it off from /admin/kiosk if they run the kiosk
-- somewhere without onlookers (rare, but supported).
--
-- Parsed in `src/lib/kiosk-ui-config.server.ts` — any value other than the
-- literal string "false" keeps the privacy-preserving default.

INSERT INTO site_settings (key, value) VALUES ('kiosk_pin_privacy_mask', 'true')
  ON CONFLICT (key) DO NOTHING;
