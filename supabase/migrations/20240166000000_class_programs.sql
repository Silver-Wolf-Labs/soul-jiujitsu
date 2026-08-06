-- Class programs — stable identity for groupings like "Gi", "No-Gi",
-- "Youth Competition". Same pattern as `instructors`: one row per logical
-- offering, referenced by a FK on the child tables. Without this, every
-- grouping query has to pivot on a free-text `title` / `class_name`,
-- which breaks the day a coach renames the class.
--
-- Additive-only + idempotent. The scalar `schedule_slots.title` and
-- `check_ins.class_name` columns stay as snapshot mirrors so existing
-- read paths keep working during the transition.
--
-- 1. `class_programs` — (id, name, slug, active, created_at, updated_at).
-- 2. `schedule_slots.program_id` — nullable FK, backfilled by slug.
-- 3. `check_ins.program_id` + `check_ins.program_name` — snapshot
--    pattern identical to the instructor snapshot so multi-instructor
--    and program attribution stay frozen at write time.
-- 4. Cleanup — delete the seed-junk slots the admin flagged (`hjkl`,
--    `FAAA`, `FOOO`, `fffff`). `check_ins.schedule_slot_id` is
--    `ON DELETE SET NULL`, so the few check-ins against these slots
--    survive; their `class_name` snapshots stay so CSV exports still
--    make sense historically.

-- ─── class_programs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_programs (
  id          SERIAL       PRIMARY KEY,
  name        TEXT         NOT NULL,
  slug        TEXT         NOT NULL UNIQUE,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_programs_active_idx ON class_programs (active);

ALTER TABLE class_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active class_programs" ON class_programs;
CREATE POLICY "Public read active class_programs"
  ON class_programs FOR SELECT TO anon, authenticated
  USING (active = TRUE);

DROP POLICY IF EXISTS "Admin manages class_programs" ON class_programs;
CREATE POLICY "Admin manages class_programs"
  ON class_programs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

CREATE OR REPLACE FUNCTION set_class_programs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_programs_updated_at ON class_programs;
CREATE TRIGGER class_programs_updated_at
  BEFORE UPDATE ON class_programs
  FOR EACH ROW EXECUTE FUNCTION set_class_programs_updated_at();

-- ─── Cleanup: delete bogus test slots BEFORE backfill ──────────────────────
-- Run this first so we don't create `class_programs` rows named "hjkl".

DELETE FROM schedule_slots
 WHERE title IN ('hjkl', 'FAAA', 'FOOO', 'fffff');

-- ─── Backfill: one program per distinct (case-insensitive) title ───────────

INSERT INTO class_programs (name, slug)
SELECT
  MIN(trim(title)) AS name,
  trim(both '-' from
       regexp_replace(lower(trim(title)), '[^a-z0-9]+', '-', 'g')) AS slug
FROM schedule_slots
WHERE title IS NOT NULL AND trim(title) <> ''
GROUP BY trim(both '-' from
              regexp_replace(lower(trim(title)), '[^a-z0-9]+', '-', 'g'))
ON CONFLICT (slug) DO NOTHING;

-- ─── schedule_slots.program_id ─────────────────────────────────────────────

ALTER TABLE schedule_slots
  ADD COLUMN IF NOT EXISTS program_id INT REFERENCES class_programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedule_slots_program_id_idx ON schedule_slots (program_id);

UPDATE schedule_slots ss
   SET program_id = cp.id
  FROM class_programs cp
 WHERE ss.program_id IS NULL
   AND ss.title IS NOT NULL
   AND trim(both '-' from
            regexp_replace(lower(trim(ss.title)), '[^a-z0-9]+', '-', 'g')) = cp.slug;

-- ─── check_ins snapshot ────────────────────────────────────────────────────

ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS program_id   INT REFERENCES class_programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_name TEXT;

CREATE INDEX IF NOT EXISTS check_ins_program_id_idx ON check_ins (program_id);

-- Backfill from class_name snapshot (lossless — we only need the mapping).
UPDATE check_ins ci
   SET program_id   = cp.id,
       program_name = cp.name
  FROM class_programs cp
 WHERE ci.program_id IS NULL
   AND ci.class_name IS NOT NULL
   AND trim(both '-' from
            regexp_replace(lower(trim(ci.class_name)), '[^a-z0-9]+', '-', 'g')) = cp.slug;
