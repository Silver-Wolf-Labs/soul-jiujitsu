-- ═════════════════════════════════════════════════════════════════════════
-- Phase 1 — Class Taxonomy foundation.
-- Adds four dimension tables (modalities / levels / focuses / audiences),
-- slot-side junctions (schedule_slot_focuses / _audiences), check-in
-- snapshot columns + junctions, SECURITY DEFINER RPCs for atomic write
-- paths, seeds, and a fail-loud backfill.
--
-- Additive only. Idempotent. Legacy columns (discipline / level / category
-- / min_age / max_age / allowed_gender / invite_only / audience_note /
-- program_id) stay for now and get dropped in a Phase 3 migration.
-- Companion docs: docs/class-taxonomy-HLD.md, docs/class-taxonomy-LLD.md.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Shared trigger helper ────────────────────────────────────────────────
-- One function across all four dimension tables. Don't duplicate what DRY
-- can solve.
CREATE OR REPLACE FUNCTION set_class_dim_updated_at() RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── class_modalities ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_modalities (
  id          SERIAL       PRIMARY KEY,
  name        TEXT         NOT NULL,
  slug        TEXT         NOT NULL UNIQUE,
  color       TEXT,                                  -- hex "#rrggbb" or NULL
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_modalities_active_idx ON class_modalities(active);
CREATE INDEX IF NOT EXISTS class_modalities_sort_idx   ON class_modalities(sort_order);

DROP TRIGGER IF EXISTS class_modalities_updated_at ON class_modalities;
CREATE TRIGGER class_modalities_updated_at
  BEFORE UPDATE ON class_modalities
  FOR EACH ROW EXECUTE FUNCTION set_class_dim_updated_at();

ALTER TABLE class_modalities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active modalities" ON class_modalities;
CREATE POLICY "Public read active modalities"
  ON class_modalities FOR SELECT TO anon, authenticated
  USING (active = TRUE);

DROP POLICY IF EXISTS "Admin manages modalities" ON class_modalities;
CREATE POLICY "Admin manages modalities"
  ON class_modalities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ── class_levels ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_levels (
  id          SERIAL       PRIMARY KEY,
  name        TEXT         NOT NULL,
  slug        TEXT         NOT NULL UNIQUE,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_levels_active_idx ON class_levels(active);
CREATE INDEX IF NOT EXISTS class_levels_sort_idx   ON class_levels(sort_order);

DROP TRIGGER IF EXISTS class_levels_updated_at ON class_levels;
CREATE TRIGGER class_levels_updated_at
  BEFORE UPDATE ON class_levels
  FOR EACH ROW EXECUTE FUNCTION set_class_dim_updated_at();

ALTER TABLE class_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active levels" ON class_levels;
CREATE POLICY "Public read active levels"
  ON class_levels FOR SELECT TO anon, authenticated
  USING (active = TRUE);

DROP POLICY IF EXISTS "Admin manages levels" ON class_levels;
CREATE POLICY "Admin manages levels"
  ON class_levels FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ── class_focuses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_focuses (
  id          SERIAL       PRIMARY KEY,
  name        TEXT         NOT NULL,
  slug        TEXT         NOT NULL UNIQUE,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_focuses_active_idx ON class_focuses(active);
CREATE INDEX IF NOT EXISTS class_focuses_sort_idx   ON class_focuses(sort_order);

DROP TRIGGER IF EXISTS class_focuses_updated_at ON class_focuses;
CREATE TRIGGER class_focuses_updated_at
  BEFORE UPDATE ON class_focuses
  FOR EACH ROW EXECUTE FUNCTION set_class_dim_updated_at();

ALTER TABLE class_focuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active focuses" ON class_focuses;
CREATE POLICY "Public read active focuses"
  ON class_focuses FOR SELECT TO anon, authenticated
  USING (active = TRUE);

DROP POLICY IF EXISTS "Admin manages focuses" ON class_focuses;
CREATE POLICY "Admin manages focuses"
  ON class_focuses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ── class_audiences ───────────────────────────────────────────────────────
-- `kind` discriminates runtime enforcement. Belt-and-suspenders CHECKs
-- prevent future `UPDATE ... SET min_age=5 WHERE kind='rank'` footguns —
-- label-only kinds (rank/access) carry NO enforcement metadata.
CREATE TABLE IF NOT EXISTS class_audiences (
  id          SERIAL       PRIMARY KEY,
  name        TEXT         NOT NULL,
  slug        TEXT         NOT NULL UNIQUE,
  kind        TEXT         NOT NULL CHECK (kind IN ('age','gender','rank','access')),
  min_age     INT,                                             -- kind='age' only
  max_age     INT,                                             -- kind='age' only
  gender      TEXT CHECK (gender IN ('female','male')),        -- kind='gender' only
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT class_audiences_age_metadata_shape
    CHECK ((kind = 'age') OR (min_age IS NULL AND max_age IS NULL)),
  CONSTRAINT class_audiences_gender_metadata_shape
    CHECK ((kind = 'gender') OR gender IS NULL),
  CONSTRAINT class_audiences_no_metadata_on_label_kinds
    CHECK (kind NOT IN ('rank','access')
           OR (min_age IS NULL AND max_age IS NULL AND gender IS NULL)),
  CONSTRAINT class_audiences_age_range
    CHECK (min_age IS NULL OR max_age IS NULL OR min_age <= max_age)
);

CREATE INDEX IF NOT EXISTS class_audiences_kind_active_idx ON class_audiences(kind, active);
CREATE INDEX IF NOT EXISTS class_audiences_sort_idx        ON class_audiences(sort_order);

DROP TRIGGER IF EXISTS class_audiences_updated_at ON class_audiences;
CREATE TRIGGER class_audiences_updated_at
  BEFORE UPDATE ON class_audiences
  FOR EACH ROW EXECUTE FUNCTION set_class_dim_updated_at();

ALTER TABLE class_audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active audiences" ON class_audiences;
CREATE POLICY "Public read active audiences"
  ON class_audiences FOR SELECT TO anon, authenticated
  USING (active = TRUE);

DROP POLICY IF EXISTS "Admin manages audiences" ON class_audiences;
CREATE POLICY "Admin manages audiences"
  ON class_audiences FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ── schedule_slots: new FKs + constraint relaxation ──────────────────────
-- `modality_id` stays nullable for Phase 1; Phase 3 promotes to NOT NULL
-- after backfill verification. `level_id` is permanently nullable
-- (classes without an explicit level are fine).
ALTER TABLE schedule_slots
  ADD COLUMN IF NOT EXISTS modality_id INT REFERENCES class_modalities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS level_id    INT REFERENCES class_levels(id)     ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedule_slots_modality_id_idx  ON schedule_slots(modality_id);
CREATE INDEX IF NOT EXISTS schedule_slots_level_id_idx     ON schedule_slots(level_id);
CREATE INDEX IF NOT EXISTS schedule_slots_modality_dow_idx ON schedule_slots(modality_id, day_of_week);

-- Relax NOT NULL on legacy columns so Phase 2's INSERT RPC can omit them.
-- These columns get dropped entirely in Phase 3. No existing rows are
-- affected (they keep their current values until the drop).
ALTER TABLE schedule_slots ALTER COLUMN category DROP NOT NULL;

-- ── schedule_slot_focuses / _audiences ────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_slot_focuses (
  schedule_slot_id  INT NOT NULL REFERENCES schedule_slots(id) ON DELETE CASCADE,
  focus_id          INT NOT NULL REFERENCES class_focuses(id)  ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (schedule_slot_id, focus_id)
);
CREATE INDEX IF NOT EXISTS schedule_slot_focuses_focus_idx ON schedule_slot_focuses(focus_id);

ALTER TABLE schedule_slot_focuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read slot focuses" ON schedule_slot_focuses;
CREATE POLICY "Public read slot focuses"
  ON schedule_slot_focuses FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM schedule_slots ss
     WHERE ss.id = schedule_slot_id AND ss.active = TRUE
  ));

DROP POLICY IF EXISTS "Admin manages slot focuses" ON schedule_slot_focuses;
CREATE POLICY "Admin manages slot focuses"
  ON schedule_slot_focuses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

CREATE TABLE IF NOT EXISTS schedule_slot_audiences (
  schedule_slot_id  INT NOT NULL REFERENCES schedule_slots(id)   ON DELETE CASCADE,
  audience_id       INT NOT NULL REFERENCES class_audiences(id)  ON DELETE CASCADE,
  PRIMARY KEY (schedule_slot_id, audience_id)
);
CREATE INDEX IF NOT EXISTS schedule_slot_audiences_audience_idx ON schedule_slot_audiences(audience_id);

ALTER TABLE schedule_slot_audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read slot audiences" ON schedule_slot_audiences;
CREATE POLICY "Public read slot audiences"
  ON schedule_slot_audiences FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM schedule_slots ss
     WHERE ss.id = schedule_slot_id AND ss.active = TRUE
  ));

DROP POLICY IF EXISTS "Admin manages slot audiences" ON schedule_slot_audiences;
CREATE POLICY "Admin manages slot audiences"
  ON schedule_slot_audiences FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ── check_ins scalar snapshots ────────────────────────────────────────────
ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS modality_id   INT REFERENCES class_modalities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modality_name TEXT,
  ADD COLUMN IF NOT EXISTS level_id      INT REFERENCES class_levels(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level_name    TEXT;

CREATE INDEX IF NOT EXISTS check_ins_modality_date_idx ON check_ins(modality_id, class_date);
CREATE INDEX IF NOT EXISTS check_ins_level_date_idx    ON check_ins(level_id, class_date);

-- ── check_in_focuses / _audiences (snapshots) ─────────────────────────────
-- PK is (check_in_id, sort_order) because audience_id/focus_id can go
-- NULL (ON DELETE SET NULL) if the dimension row is hard-deleted, and we
-- still want the snapshot (audience_name/focus_name) retained for
-- historical CSVs. Snapshot RPC regenerates sort_order per row via
-- ROW_NUMBER() so duplicate slot-side sort_orders can't collide.
CREATE TABLE IF NOT EXISTS check_in_focuses (
  check_in_id  BIGINT NOT NULL REFERENCES check_ins(id)  ON DELETE CASCADE,
  focus_id     INT             REFERENCES class_focuses(id) ON DELETE SET NULL,
  focus_name   TEXT,
  sort_order   INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (check_in_id, sort_order)
);
CREATE INDEX IF NOT EXISTS check_in_focuses_focus_idx    ON check_in_focuses(focus_id);
CREATE INDEX IF NOT EXISTS check_in_focuses_check_in_idx ON check_in_focuses(check_in_id);

ALTER TABLE check_in_focuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages check_in_focuses" ON check_in_focuses;
CREATE POLICY "Admin manages check_in_focuses"
  ON check_in_focuses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

DROP POLICY IF EXISTS "Members read own check_in_focuses" ON check_in_focuses;
CREATE POLICY "Members read own check_in_focuses"
  ON check_in_focuses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM check_ins ci
    JOIN members m ON m.id = ci.member_id
    WHERE ci.id = check_in_id AND m.user_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS check_in_audiences (
  check_in_id    BIGINT NOT NULL REFERENCES check_ins(id)    ON DELETE CASCADE,
  audience_id    INT             REFERENCES class_audiences(id) ON DELETE SET NULL,
  audience_name  TEXT,
  audience_kind  TEXT CHECK (audience_kind IN ('age','gender','rank','access')),
  sort_order     INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (check_in_id, sort_order)
);
CREATE INDEX IF NOT EXISTS check_in_audiences_audience_idx ON check_in_audiences(audience_id);
CREATE INDEX IF NOT EXISTS check_in_audiences_check_in_idx ON check_in_audiences(check_in_id);

ALTER TABLE check_in_audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages check_in_audiences" ON check_in_audiences;
CREATE POLICY "Admin manages check_in_audiences"
  ON check_in_audiences FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

DROP POLICY IF EXISTS "Members read own check_in_audiences" ON check_in_audiences;
CREATE POLICY "Members read own check_in_audiences"
  ON check_in_audiences FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM check_ins ci
    JOIN members m ON m.id = ci.member_id
    WHERE ci.id = check_in_id AND m.user_id = auth.uid()
  ));

-- ═════════════════════════════════════════════════════════════════════════
-- Seeds. Slugs are natural keys; re-running is a no-op.
-- ═════════════════════════════════════════════════════════════════════════

INSERT INTO class_modalities (name, slug, sort_order, color) VALUES
  ('Gi',               'gi',               10, '#3E63DD'),
  ('No-Gi',            'no-gi',            20, '#8E4EC6'),
  ('Open Mat',         'open-mat',         30, '#30A46C'),
  ('Competition Prep', 'competition-prep', 40, '#E5A50A'),
  ('Conditioning',     'conditioning',     50, '#D4571E')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO class_levels (name, slug, sort_order) VALUES
  ('All Levels',   'all-levels',   10),
  ('Fundamentals', 'fundamentals', 20),
  ('Beginners',    'beginners',    30),
  ('Intermediate', 'intermediate', 40),
  ('Advanced',     'advanced',     50)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO class_focuses (name, slug, sort_order) VALUES
  ('Leg Locks',           'leg-locks',           10),
  ('Takedowns',           'takedowns',           20),
  ('Guard Passing',       'guard-passing',       30),
  ('Submissions',         'submissions',         40),
  ('Positional Sparring', 'positional-sparring', 50)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO class_audiences (name, slug, kind, min_age, max_age, gender, sort_order) VALUES
  ('Age 7-10',          'age-7-10',         'age',    7,    10,   NULL,     10),
  ('Age 11-16',         'age-11-16',        'age',    11,   16,   NULL,     20),
  ('Age 16+',           'age-16-plus',      'age',    16,   NULL, NULL,     30),
  ('Age 40+',           'age-40-plus',      'age',    40,   NULL, NULL,     40),
  ('Women Only',        'women-only',       'gender', NULL, NULL, 'female', 50),
  ('Men Only',          'men-only',         'gender', NULL, NULL, 'male',   60),
  ('Black Belts Only',  'black-belts-only', 'rank',   NULL, NULL, NULL,     70),
  ('Brown Belt and Up', 'brown-plus',       'rank',   NULL, NULL, NULL,     80),
  ('Blue Belt and Up',  'blue-plus',        'rank',   NULL, NULL, NULL,     90),
  ('Invite Only',       'invite-only',      'access', NULL, NULL, NULL,    100),
  ('Members Only',      'members-only',     'access', NULL, NULL, NULL,    110)
ON CONFLICT (slug) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════
-- Backfill. Fail-loud: anything we can't deterministically map surfaces
-- for admin review — never a silent "default to Gi".
-- ═════════════════════════════════════════════════════════════════════════

-- ── schedule_slots.modality_id ───────────────────────────────────────────
-- Priority 1: discipline is a direct indicator for 3 of 5 modalities.
UPDATE schedule_slots ss SET modality_id = (
  CASE ss.discipline
    WHEN 'gi'           THEN (SELECT id FROM class_modalities WHERE slug = 'gi')
    WHEN 'nogi'         THEN (SELECT id FROM class_modalities WHERE slug = 'no-gi')
    WHEN 'conditioning' THEN (SELECT id FROM class_modalities WHERE slug = 'conditioning')
    ELSE NULL
  END
)
WHERE modality_id IS NULL;

-- Priority 2: category fills in Open Mat + Competition Prep.
UPDATE schedule_slots ss SET modality_id = (
  CASE ss.category
    WHEN 'open_mat'    THEN (SELECT id FROM class_modalities WHERE slug = 'open-mat')
    WHEN 'competition' THEN (SELECT id FROM class_modalities WHERE slug = 'competition-prep')
    ELSE NULL
  END
)
WHERE modality_id IS NULL;

-- Priority 3: discipline='mixed' with no `category` signal → Open Mat.
-- Matches the historical "catch-all mixed class" pattern.
UPDATE schedule_slots
   SET modality_id = (SELECT id FROM class_modalities WHERE slug = 'open-mat')
 WHERE modality_id IS NULL
   AND discipline = 'mixed';

-- Fail-loud: surface any remaining NULL to operator logs. View renders
-- the gap list in /admin/classes so it's easy to close out.
DO $$
DECLARE v_unmapped INT;
BEGIN
  SELECT COUNT(*) INTO v_unmapped FROM schedule_slots WHERE modality_id IS NULL;
  IF v_unmapped > 0 THEN
    RAISE NOTICE '[taxonomy backfill] % schedule_slots have no modality_id. Admin must resolve via /admin/classes.', v_unmapped;
  END IF;
END
$$;

CREATE OR REPLACE VIEW schedule_slots_needs_review AS
  SELECT id, day_of_week, start_time, title, discipline, category, audience_note
    FROM schedule_slots
   WHERE modality_id IS NULL;

-- ── schedule_slots.level_id ──────────────────────────────────────────────
UPDATE schedule_slots ss SET level_id = (
  CASE ss.level
    WHEN 'all_levels'   THEN (SELECT id FROM class_levels WHERE slug = 'all-levels')
    WHEN 'fundamentals' THEN (SELECT id FROM class_levels WHERE slug = 'fundamentals')
    WHEN 'intermediate' THEN (SELECT id FROM class_levels WHERE slug = 'intermediate')
    WHEN 'advanced'     THEN (SELECT id FROM class_levels WHERE slug = 'advanced')
    WHEN 'expert'       THEN (SELECT id FROM class_levels WHERE slug = 'advanced')
    ELSE NULL
  END
)
WHERE level_id IS NULL;

-- ── schedule_slot_audiences from structured fields ───────────────────────
-- Age bands: match on (min_age, max_age).
INSERT INTO schedule_slot_audiences (schedule_slot_id, audience_id)
SELECT ss.id, ca.id
  FROM schedule_slots ss, class_audiences ca
 WHERE ca.kind = 'age'
   AND ss.min_age IS NOT NULL
   AND COALESCE(ss.min_age, -1)  = COALESCE(ca.min_age, -1)
   AND COALESCE(ss.max_age, -1)  = COALESCE(ca.max_age, -1)
ON CONFLICT DO NOTHING;

-- Gender gates.
INSERT INTO schedule_slot_audiences (schedule_slot_id, audience_id)
SELECT ss.id, ca.id
  FROM schedule_slots ss, class_audiences ca
 WHERE ca.kind = 'gender'
   AND ss.allowed_gender IS NOT NULL
   AND ss.allowed_gender = ca.gender
ON CONFLICT DO NOTHING;

-- invite_only flag → Invite Only audience.
INSERT INTO schedule_slot_audiences (schedule_slot_id, audience_id)
SELECT ss.id, (SELECT id FROM class_audiences WHERE slug = 'invite-only')
  FROM schedule_slots ss
 WHERE ss.invite_only = TRUE
ON CONFLICT DO NOTHING;

-- audience_note parse. Seed uses en-dash (U+2013) — naive `-` regex
-- misses every youth row. Split on comma so multi-restriction notes
-- ("Women Only, 40+") map to both audiences.
WITH notes AS (
  SELECT ss.id AS slot_id,
         trim(part) AS token
    FROM schedule_slots ss,
         unnest(string_to_array(COALESCE(ss.audience_note, ''), ',')) AS t(part)
   WHERE trim(part) <> ''
)
INSERT INTO schedule_slot_audiences (schedule_slot_id, audience_id)
SELECT DISTINCT notes.slot_id, ca.id
  FROM notes
  JOIN class_audiences ca
    ON (
          (ca.slug = 'members-only' AND notes.token ILIKE 'members only%')
       OR (ca.slug = 'invite-only'  AND notes.token ILIKE 'invite only%')
       OR (ca.slug = 'women-only'   AND notes.token ~* 'women.*only')
       OR (ca.slug = 'men-only'     AND notes.token ~* '(^|\s)men[\s-]+only')
       OR (ca.slug = 'age-7-10'     AND notes.token ~ '^[Aa]ges\s+7[\s–—-]+10$')
       OR (ca.slug = 'age-11-16'    AND notes.token ~ '^[Aa]ges\s+11[\s–—-]+16$')
       OR (ca.slug = 'age-16-plus'  AND notes.token ~* '^(ages\s+16\+|16\s*yrs?\+|16\+)$')
       OR (ca.slug = 'age-40-plus'  AND notes.token ~* '^(ages\s+40\+|40\s*yrs?\+|40\+)$')
    )
ON CONFLICT DO NOTHING;

-- Safety net: any note that survived without matching audience is flagged.
DO $$
DECLARE v_orphan INT;
BEGIN
  SELECT COUNT(*) INTO v_orphan
    FROM schedule_slots ss
   WHERE ss.audience_note IS NOT NULL
     AND trim(ss.audience_note) <> ''
     AND NOT EXISTS (
       SELECT 1 FROM schedule_slot_audiences ssa WHERE ssa.schedule_slot_id = ss.id
     );
  IF v_orphan > 0 THEN
    RAISE NOTICE '[taxonomy backfill] % slots have audience_note with no parsed audience. Review /admin/classes.', v_orphan;
  END IF;
END
$$;

-- ── schedule_slot_focuses via title keywords ─────────────────────────────
INSERT INTO schedule_slot_focuses (schedule_slot_id, focus_id)
SELECT ss.id, (SELECT id FROM class_focuses WHERE slug = 'leg-locks')
  FROM schedule_slots ss
 WHERE ss.title ILIKE '%leg%'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slot_focuses (schedule_slot_id, focus_id)
SELECT ss.id, (SELECT id FROM class_focuses WHERE slug = 'takedowns')
  FROM schedule_slots ss
 WHERE ss.title ILIKE '%takedown%'
ON CONFLICT DO NOTHING;

-- ── check_ins scalar snapshots from slot join ────────────────────────────
UPDATE check_ins ci SET
  modality_id   = ss.modality_id,
  modality_name = cm.name,
  level_id      = ss.level_id,
  level_name    = cl.name
  FROM schedule_slots ss
  LEFT JOIN class_modalities cm ON cm.id = ss.modality_id
  LEFT JOIN class_levels     cl ON cl.id = ss.level_id
 WHERE ci.schedule_slot_id = ss.id
   AND ci.modality_id IS NULL;

-- ── check_in_focuses / _audiences backfill ───────────────────────────────
-- Sort_order regenerated via ROW_NUMBER to guarantee PK uniqueness even
-- if slot-side sort_orders were all 0.
INSERT INTO check_in_focuses (check_in_id, focus_id, focus_name, sort_order)
SELECT ci.id, ssf.focus_id, cf.name,
       (ROW_NUMBER() OVER (PARTITION BY ci.id ORDER BY ssf.sort_order, ssf.focus_id) - 1)::INT
  FROM check_ins ci
  JOIN schedule_slot_focuses ssf ON ssf.schedule_slot_id = ci.schedule_slot_id
  JOIN class_focuses         cf  ON cf.id = ssf.focus_id
 WHERE ci.schedule_slot_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO check_in_audiences (check_in_id, audience_id, audience_name, audience_kind, sort_order)
SELECT ci.id, ssa.audience_id, ca.name, ca.kind,
       (ROW_NUMBER() OVER (PARTITION BY ci.id ORDER BY ca.sort_order, ssa.audience_id) - 1)::INT
  FROM check_ins ci
  JOIN schedule_slot_audiences ssa ON ssa.schedule_slot_id = ci.schedule_slot_id
  JOIN class_audiences         ca  ON ca.id = ssa.audience_id
 WHERE ci.schedule_slot_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════
-- RPCs — atomic multi-table writes. Pattern mirrors belt_history_tx /
-- create_member_profile_tx / update_member_belt_details_tx: SECURITY
-- DEFINER, SET search_path=public, REVOKE from PUBLIC, GRANT to
-- service_role only. Server actions call these through the service
-- client after `requireAdmin()` has gated the caller.
-- ═════════════════════════════════════════════════════════════════════════

-- ── create_schedule_slot_tx ──────────────────────────────────────────────
-- Single-RPC slot insert + focus/audience junctions. No INSERT-then-RPC
-- split that could orphan a slot row on partial failure. Does NOT touch
-- instructor junctions — those flow through the existing post-insert
-- `syncSlotInstructors` helper which runs after the slot id is known.
CREATE OR REPLACE FUNCTION create_schedule_slot_tx(
  p_day_of_week   SMALLINT,
  p_start_time    TIME,
  p_end_time      TIME,
  p_title         TEXT,
  p_modality_id   INT,
  p_level_id      INT,
  p_focus_ids     INT[],
  p_audience_ids  INT[],
  p_area          TEXT,
  p_sort_order    INT,
  p_active        BOOLEAN,
  p_link_label    TEXT,
  p_link_url      TEXT,
  p_show_instructor BOOLEAN,
  p_instructor_name_display TEXT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_id INT;
BEGIN
  IF p_modality_id IS NULL THEN
    RAISE EXCEPTION 'create_schedule_slot_tx: modality_id is required';
  END IF;

  INSERT INTO schedule_slots (
    day_of_week, start_time, end_time, title, modality_id, level_id,
    area, sort_order, active, link_label, link_url,
    show_instructor, instructor_name_display
  ) VALUES (
    p_day_of_week, p_start_time, p_end_time, p_title, p_modality_id, p_level_id,
    p_area, COALESCE(p_sort_order, 0), COALESCE(p_active, TRUE),
    p_link_label, p_link_url,
    COALESCE(p_show_instructor, FALSE),
    COALESCE(p_instructor_name_display, 'full')
  )
  RETURNING id INTO v_slot_id;

  IF p_focus_ids IS NOT NULL AND array_length(p_focus_ids, 1) IS NOT NULL THEN
    INSERT INTO schedule_slot_focuses (schedule_slot_id, focus_id, sort_order)
    SELECT v_slot_id, fid, (ord - 1)::INT
      FROM unnest(p_focus_ids) WITH ORDINALITY AS t(fid, ord)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_audience_ids IS NOT NULL AND array_length(p_audience_ids, 1) IS NOT NULL THEN
    INSERT INTO schedule_slot_audiences (schedule_slot_id, audience_id)
    SELECT v_slot_id, aid
      FROM unnest(p_audience_ids) AS aid
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION create_schedule_slot_tx(
  SMALLINT, TIME, TIME, TEXT, INT, INT, INT[], INT[], TEXT, INT, BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_schedule_slot_tx(
  SMALLINT, TIME, TIME, TEXT, INT, INT, INT[], INT[], TEXT, INT, BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT
) TO service_role;

-- ── update_schedule_slot_tx ──────────────────────────────────────────────
-- Mirrors create: UPDATE the slot row + full replace of focus/audience
-- junctions. Existing instructor junction is left alone (managed by
-- `syncSlotInstructors` on the caller side). Legacy scalar columns
-- (discipline/level/category/min_age/max_age/allowed_gender/invite_only/
-- audience_note/program_id) are NOT overwritten by this RPC — Phase 3
-- drops them, and until then the pre-backfill values linger harmlessly.
CREATE OR REPLACE FUNCTION update_schedule_slot_tx(
  p_slot_id       INT,
  p_day_of_week   SMALLINT,
  p_start_time    TIME,
  p_end_time      TIME,
  p_title         TEXT,
  p_modality_id   INT,
  p_level_id      INT,
  p_focus_ids     INT[],
  p_audience_ids  INT[],
  p_area          TEXT,
  p_sort_order    INT,
  p_active        BOOLEAN,
  p_link_label    TEXT,
  p_link_url      TEXT,
  p_show_instructor BOOLEAN,
  p_instructor_name_display TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_modality_id IS NULL THEN
    RAISE EXCEPTION 'update_schedule_slot_tx: modality_id is required';
  END IF;

  UPDATE schedule_slots
     SET day_of_week             = p_day_of_week,
         start_time              = p_start_time,
         end_time                = p_end_time,
         title                   = p_title,
         modality_id             = p_modality_id,
         level_id                = p_level_id,
         area                    = p_area,
         sort_order              = COALESCE(p_sort_order, 0),
         active                  = COALESCE(p_active, TRUE),
         link_label              = p_link_label,
         link_url                = p_link_url,
         show_instructor         = COALESCE(p_show_instructor, show_instructor),
         instructor_name_display = COALESCE(p_instructor_name_display, instructor_name_display)
   WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_schedule_slot_tx: slot % not found', p_slot_id;
  END IF;

  DELETE FROM schedule_slot_focuses   WHERE schedule_slot_id = p_slot_id;
  DELETE FROM schedule_slot_audiences WHERE schedule_slot_id = p_slot_id;

  IF p_focus_ids IS NOT NULL AND array_length(p_focus_ids, 1) IS NOT NULL THEN
    INSERT INTO schedule_slot_focuses (schedule_slot_id, focus_id, sort_order)
    SELECT p_slot_id, fid, (ord - 1)::INT
      FROM unnest(p_focus_ids) WITH ORDINALITY AS t(fid, ord)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_audience_ids IS NOT NULL AND array_length(p_audience_ids, 1) IS NOT NULL THEN
    INSERT INTO schedule_slot_audiences (schedule_slot_id, audience_id)
    SELECT p_slot_id, aid FROM unnest(p_audience_ids) AS aid
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION update_schedule_slot_tx(
  INT, SMALLINT, TIME, TIME, TEXT, INT, INT, INT[], INT[], TEXT, INT, BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_schedule_slot_tx(
  INT, SMALLINT, TIME, TIME, TEXT, INT, INT, INT[], INT[], TEXT, INT, BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT
) TO service_role;

-- ── snapshot_check_in_taxonomy ───────────────────────────────────────────
-- Called after every check-in INSERT (kiosk + admin paths). Scalar
-- updates are FATAL on failure (primary correctness signal); junction
-- snapshots are NON-FATAL inside nested EXCEPTION blocks (analytics
-- nice-to-have, not a reason to roll back the member's check-in).
-- ROW_NUMBER() regenerates sort_order so multiple slot-side rows with
-- sort_order=0 can't collide on (check_in_id, sort_order) PK.
CREATE OR REPLACE FUNCTION snapshot_check_in_taxonomy(
  p_check_in_id BIGINT,
  p_slot_id     INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE check_ins ci
     SET modality_id   = ss.modality_id,
         modality_name = cm.name,
         level_id      = ss.level_id,
         level_name    = cl.name
    FROM schedule_slots ss
    LEFT JOIN class_modalities cm ON cm.id = ss.modality_id
    LEFT JOIN class_levels     cl ON cl.id = ss.level_id
   WHERE ci.id = p_check_in_id
     AND ss.id = p_slot_id;

  BEGIN
    INSERT INTO check_in_focuses (check_in_id, focus_id, focus_name, sort_order)
    SELECT p_check_in_id, ssf.focus_id, cf.name,
           (ROW_NUMBER() OVER (ORDER BY ssf.sort_order, ssf.focus_id) - 1)::INT
      FROM schedule_slot_focuses ssf
      JOIN class_focuses cf ON cf.id = ssf.focus_id
     WHERE ssf.schedule_slot_id = p_slot_id
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[snapshot_check_in_taxonomy] focus snapshot failed for check_in=%: %', p_check_in_id, SQLERRM;
  END;

  BEGIN
    INSERT INTO check_in_audiences (check_in_id, audience_id, audience_name, audience_kind, sort_order)
    SELECT p_check_in_id, ssa.audience_id, ca.name, ca.kind,
           (ROW_NUMBER() OVER (ORDER BY ca.sort_order, ssa.audience_id) - 1)::INT
      FROM schedule_slot_audiences ssa
      JOIN class_audiences ca ON ca.id = ssa.audience_id
     WHERE ssa.schedule_slot_id = p_slot_id
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[snapshot_check_in_taxonomy] audience snapshot failed for check_in=%: %', p_check_in_id, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION snapshot_check_in_taxonomy(BIGINT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION snapshot_check_in_taxonomy(BIGINT, INT) TO service_role;
