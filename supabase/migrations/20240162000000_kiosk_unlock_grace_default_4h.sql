-- Kiosk: shift the default unlock-grace policy from "strict" to "4h".
--
-- Product decision: requiring a fresh PIN on every refresh is overkill for
-- the typical gym kiosk, which sits behind the front desk. 4h covers a
-- half-shift and removes the friction of the old default without reaching
-- the all-day persistence of 8h/16h.
--
-- The UPDATE only touches installs that still carry the original "strict"
-- seed — any admin who has explicitly picked a different value (including
-- someone who actively wants strict and changes it back) is preserved on
-- the next run of this file (it's idempotent after the INSERT fallback).

UPDATE site_settings
   SET value = '4h'
 WHERE key = 'kiosk_unlock_grace' AND value = 'strict';

INSERT INTO site_settings (key, value) VALUES ('kiosk_unlock_grace', '4h')
  ON CONFLICT (key) DO NOTHING;
