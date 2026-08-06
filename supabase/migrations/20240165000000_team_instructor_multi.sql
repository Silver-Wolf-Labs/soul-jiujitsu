-- Team ↔ Instructor unification + multi-instructor classes.
--
-- Four structural additions, one cleanup. All additive or idempotent
-- so it's safe to re-run.
--
-- 1. `team` gains `visible_on_public_team` + `visible_until` so guest/
--    visiting coaches can opt in to the public /team with an
--    expiration date.
-- 2. `team.type` CHECK gains 'owner'.
-- 3. `instructors.team_member_id` — nullable unique FK. When set, the
--    instructor has a public `team` profile; when null, they're an
--    ad-hoc stub (e.g. "JC") or a temp coach who never got a bio.
-- 4. `schedule_slot_instructors` — M2M junction. A class can have 0,
--    1, or many instructors, in a preferred `sort_order` (primary first).
-- 5. `check_in_instructors` — M2M junction for attribution snapshots.
--    Mirrors the pattern on `check_ins` but allows multi-instructor
--    classes to credit every teacher.
-- 6. `schedule_slots.instructor_name_display` enum — full | first_only
--    | last_only. Pairs with the existing `show_instructor` bool.
--
-- Scalar `schedule_slots.instructor_id` / `check_ins.instructor_id`
-- columns STAY as "primary instructor" for backward compatibility —
-- every existing read path keeps working. New reads needing the full
-- list JOIN the junction. A follow-up cleanup migration can drop the
-- scalars once every caller has migrated.
--
-- Cleanup:
-- • The `walter` slug is renamed to `walter-davis`, name to
--   "Walter Davis". Same `instructors.id` → 2,400+ existing check-ins
--   keep their attribution.
-- • Bogus `fff` and `fau` are deleted. `ON DELETE SET NULL` keeps the
--   referencing check-ins alive; their `instructor_name` snapshot is
--   nulled so CSV exports don't display garbage.
-- • Synthetic seed instructors from the earlier analytics seed are
--   purged so the bootstrap script can own the canonical roster.
--   `guest-instructor` is retained — the canonical visiting coach.

-- ─── team extensions ───────────────────────────────────────────────────────

ALTER TABLE team
  ADD COLUMN IF NOT EXISTS visible_on_public_team BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS visible_until TIMESTAMPTZ;

-- Expand the type CHECK to allow 'owner'. Postgres requires drop+recreate
-- to replace a CHECK constraint.
ALTER TABLE team DROP CONSTRAINT IF EXISTS team_type_check;
ALTER TABLE team ADD CONSTRAINT team_type_check
  CHECK (type IN ('owner', 'head_coach', 'instructor', 'guest'));

-- ─── instructors ↔ team link ───────────────────────────────────────────────

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS team_member_id BIGINT REFERENCES team(id) ON DELETE SET NULL;

-- Partial unique index: at most one instructor linked per team member.
-- `WHERE team_member_id IS NOT NULL` so stub instructors (null link) don't
-- compete for the slot.
CREATE UNIQUE INDEX IF NOT EXISTS instructors_team_member_id_uniq
  ON instructors(team_member_id) WHERE team_member_id IS NOT NULL;

-- ─── schedule_slot_instructors (M2M) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_slot_instructors (
  schedule_slot_id INT NOT NULL REFERENCES schedule_slots(id) ON DELETE CASCADE,
  instructor_id    INT NOT NULL REFERENCES instructors(id)    ON DELETE CASCADE,
  -- 0 = primary. Display uses this order; scalar `schedule_slots.instructor_id`
  -- mirrors the primary for backward compatibility.
  sort_order       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (schedule_slot_id, instructor_id)
);

CREATE INDEX IF NOT EXISTS schedule_slot_instructors_instructor_idx
  ON schedule_slot_instructors(instructor_id);

ALTER TABLE schedule_slot_instructors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read schedule_slot_instructors" ON schedule_slot_instructors;
CREATE POLICY "Public read schedule_slot_instructors"
  ON schedule_slot_instructors FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM schedule_slots s WHERE s.id = schedule_slot_id AND s.active = TRUE
  ));

DROP POLICY IF EXISTS "Admin manages schedule_slot_instructors" ON schedule_slot_instructors;
CREATE POLICY "Admin manages schedule_slot_instructors"
  ON schedule_slot_instructors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ─── check_in_instructors (M2M + snapshot) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS check_in_instructors (
  check_in_id     BIGINT NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
  -- NULL → free-text stub or purged instructor. `instructor_name` carries
  -- the snapshot regardless. `ON DELETE SET NULL` keeps historical
  -- attribution when an instructor is deleted.
  instructor_id   INT REFERENCES instructors(id) ON DELETE SET NULL,
  instructor_name TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (check_in_id, sort_order)
);

CREATE INDEX IF NOT EXISTS check_in_instructors_instructor_idx
  ON check_in_instructors(instructor_id);
CREATE INDEX IF NOT EXISTS check_in_instructors_check_in_idx
  ON check_in_instructors(check_in_id);

ALTER TABLE check_in_instructors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages check_in_instructors" ON check_in_instructors;
CREATE POLICY "Admin manages check_in_instructors"
  ON check_in_instructors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

DROP POLICY IF EXISTS "Members read own check_in_instructors" ON check_in_instructors;
CREATE POLICY "Members read own check_in_instructors"
  ON check_in_instructors FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM check_ins ci
    JOIN members m ON m.id = ci.member_id
    WHERE ci.id = check_in_id AND m.user_id = auth.uid()
  ));

-- ─── schedule_slots: display format ────────────────────────────────────────

ALTER TABLE schedule_slots
  ADD COLUMN IF NOT EXISTS instructor_name_display TEXT NOT NULL DEFAULT 'full';

-- Apply CHECK after the default so existing rows satisfy it.
ALTER TABLE schedule_slots DROP CONSTRAINT IF EXISTS schedule_slots_instructor_name_display_check;
ALTER TABLE schedule_slots ADD CONSTRAINT schedule_slots_instructor_name_display_check
  CHECK (instructor_name_display IN ('full', 'first_only', 'last_only'));

-- ─── Backfill junctions from existing scalars ──────────────────────────────

INSERT INTO schedule_slot_instructors (schedule_slot_id, instructor_id, sort_order)
SELECT id, instructor_id, 0
  FROM schedule_slots
 WHERE instructor_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO check_in_instructors (check_in_id, instructor_id, instructor_name, sort_order)
SELECT id, instructor_id, instructor_name, 0
  FROM check_ins
 WHERE instructor_id IS NOT NULL;

-- ─── Cleanup: merge old Walter into Walter Davis ───────────────────────────
-- Preserves instructors.id, so every existing check-in still attributes
-- to "Walter Davis" instead of the old bare "Walter".

UPDATE instructors
   SET name = 'Walter Davis',
       slug = 'walter-davis'
 WHERE slug = 'walter';

-- ─── Cleanup: purge bogus + synthetic instructors ──────────────────────────
-- `fff`, `fau` are clearly test rows. The analytics seed also created a
-- handful of synthetic instructors we're about to replace with the
-- canonical bootstrap list — delete those too so the bootstrap script
-- owns a clean roster. `guest-instructor` is kept: it will be upserted into
-- the canonical "external/seminar" Soul JJ.

DELETE FROM instructors WHERE slug IN (
  'fff',
  'fau',
  'paul-schreiner',
  'henrique-machado',
  'carla-monteiro',
  'zach-noble',
  'jon-danis'
);

-- Any check-in whose scalar instructor_id was just SET NULL by the delete
-- above, and whose snapshot name is bogus, loses its name too so CSVs
-- don't display garbage. "Walter" was renamed in place so its snapshots
-- are preserved.
UPDATE check_ins
   SET instructor_name = NULL
 WHERE instructor_id IS NULL
   AND instructor_name IN (
     'fff', 'Fau', 'fau',
     'Paul Schreiner', 'Henrique Machado', 'Carla Monteiro',
     'Zach Noble', 'Jon Danis'
   );

UPDATE check_in_instructors
   SET instructor_name = NULL
 WHERE instructor_id IS NULL
   AND instructor_name IN (
     'fff', 'Fau', 'fau',
     'Paul Schreiner', 'Henrique Machado', 'Carla Monteiro',
     'Zach Noble', 'Jon Danis'
   );
