-- Instructor identity — stable IDs for analytics.
--
-- Up to now, `schedule_slots.instructor_name` has been free-text. That breaks
-- historical reporting the moment an instructor is renamed (or the same
-- person is typed two different ways). Analytics treats instructor as a
-- first-class entity, so we:
--
--   1. Create a stable `instructors` table.
--   2. Backfill from distinct `schedule_slots.instructor_name` values using
--      a slug dedupe.
--   3. Add `schedule_slots.instructor_id` (nullable FK, keep old text column
--      as a display snapshot / fallback so legacy code paths don't break).
--   4. Snapshot `instructor_id` + `instructor_name` onto `check_ins` so the
--      moment a check-in is recorded, its attribution is frozen in time —
--      schedule edits don't drift history. Backfill existing rows the same
--      way.
--
-- The migration is additive-only: no columns dropped, no data transformed
-- destructively. Safe to re-run; every DDL statement uses IF NOT EXISTS /
-- ON CONFLICT semantics so re-applying is a no-op.

-- ─── instructors table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instructors (
  id         SERIAL       PRIMARY KEY,
  name       TEXT         NOT NULL,
  -- Slug is the dedupe key during backfill and the URL-safe handle for any
  -- future /admin/instructors/[slug] route. Case-insensitive + normalized.
  slug       TEXT         NOT NULL UNIQUE,
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instructors_active_idx ON instructors (active);

ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active instructors" ON instructors;
CREATE POLICY "Public read active instructors"
  ON instructors FOR SELECT TO anon, authenticated
  USING (active = TRUE);

DROP POLICY IF EXISTS "Admin manages instructors" ON instructors;
CREATE POLICY "Admin manages instructors"
  ON instructors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ─── Backfill instructors from existing schedule_slots.instructor_name ──────
--
-- Slug rule: lowercase, non-alphanumerics collapsed to single dashes, trimmed.
-- We collapse on slug so "Coach Alex" and "coach alex" resolve to the same
-- instructor on re-runs. Seed with MIN(name) to pick a stable canonical form.

INSERT INTO instructors (name, slug)
SELECT
  MIN(trim(instructor_name)) AS name,
  trim(both '-' from
       regexp_replace(lower(trim(instructor_name)), '[^a-z0-9]+', '-', 'g')) AS slug
FROM schedule_slots
WHERE instructor_name IS NOT NULL
  AND trim(instructor_name) <> ''
GROUP BY trim(both '-' from
              regexp_replace(lower(trim(instructor_name)), '[^a-z0-9]+', '-', 'g'))
ON CONFLICT (slug) DO NOTHING;

-- ─── schedule_slots.instructor_id ────────────────────────────────────────────

ALTER TABLE schedule_slots
  ADD COLUMN IF NOT EXISTS instructor_id INT REFERENCES instructors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedule_slots_instructor_id_idx ON schedule_slots (instructor_id);

-- Backfill: match each slot's instructor_name to its slug.
UPDATE schedule_slots ss
SET instructor_id = i.id
FROM instructors i
WHERE ss.instructor_id IS NULL
  AND ss.instructor_name IS NOT NULL
  AND trim(ss.instructor_name) <> ''
  AND trim(both '-' from
           regexp_replace(lower(trim(ss.instructor_name)), '[^a-z0-9]+', '-', 'g')) = i.slug;

-- ─── check_ins instructor snapshot ──────────────────────────────────────────
--
-- Two columns: the FK (for grouping over time, even if an instructor is
-- renamed) + a plain-text name snapshot (for display without a JOIN and for
-- surviving instructor deletion via ON DELETE SET NULL).

ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS instructor_id   INT REFERENCES instructors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instructor_name TEXT;

CREATE INDEX IF NOT EXISTS check_ins_instructor_id_idx ON check_ins (instructor_id);

-- Backfill from each check-in's originating schedule_slot. Check-ins whose
-- schedule_slot_id is NULL (e.g., manually-entered "other class" rows) stay
-- NULL — analytics groups those as "Unassigned".
UPDATE check_ins ci
SET instructor_id   = ss.instructor_id,
    instructor_name = ss.instructor_name
FROM schedule_slots ss
WHERE ci.instructor_id IS NULL
  AND ci.schedule_slot_id = ss.id;

-- Keep `updated_at` fresh on write — small trigger rather than app-level clocks
-- so the name/slug edit audit is always accurate.
CREATE OR REPLACE FUNCTION set_instructors_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS instructors_updated_at ON instructors;
CREATE TRIGGER instructors_updated_at
  BEFORE UPDATE ON instructors
  FOR EACH ROW EXECUTE FUNCTION set_instructors_updated_at();
