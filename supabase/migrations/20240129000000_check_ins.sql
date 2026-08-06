-- Check-ins: records every class attendance for a member.
-- Source is either 'kiosk' (self check-in at front desk) or 'admin'.

CREATE TABLE IF NOT EXISTS check_ins (
  id               BIGSERIAL PRIMARY KEY,
  member_id        INT          NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  schedule_slot_id INT          REFERENCES schedule_slots(id) ON DELETE SET NULL,
  class_name       TEXT         NOT NULL,          -- snapshot at check-in time
  class_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
  checked_in_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  source           TEXT         NOT NULL DEFAULT 'kiosk' CHECK (source IN ('kiosk', 'admin')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS check_ins_member_id_idx   ON check_ins (member_id);
CREATE INDEX IF NOT EXISTS check_ins_class_date_idx  ON check_ins (class_date DESC);
CREATE INDEX IF NOT EXISTS check_ins_member_date_idx ON check_ins (member_id, class_date DESC);

-- RLS: admins can read/write all; members can read their own via portal.
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage check_ins"    ON check_ins;
DROP POLICY IF EXISTS "Members read own check_ins" ON check_ins;

CREATE POLICY "Admins manage check_ins" ON check_ins
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Members read own check_ins" ON check_ins
  FOR SELECT
  USING (
    member_id IN (SELECT id FROM members WHERE user_id = auth.uid())
  );

-- Kiosk settings seeded into site_settings (idempotent).
-- kiosk_pin:           4-digit PIN to unlock the kiosk device (admin changes this).
-- kiosk_session_token: rotating UUID set on each successful unlock; validated server-side.
-- L-6: Default PIN is empty — admin must set a real PIN before kiosk can be used
INSERT INTO site_settings (key, value) VALUES ('kiosk_pin', '')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO site_settings (key, value) VALUES ('kiosk_session_token', '')
  ON CONFLICT (key) DO NOTHING;

-- Which member statuses can check in via kiosk (comma-separated).
INSERT INTO site_settings (key, value) VALUES ('kiosk_allowed_statuses', 'active')
  ON CONFLICT (key) DO NOTHING;
