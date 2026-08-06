-- ═════════════════════════════════════════════════════════════════════════
-- Phase 3 — drop the pre-taxonomy columns and the short-lived
-- `class_programs` table. This is the destructive cutover; it runs ONLY
-- after Phase 2 has verified that every slot has `modality_id` set and
-- every check-in has its snapshot populated.
--
-- The Phase 1 migration (20240167_class_taxonomy) left the legacy
-- columns in place so the Phase 2 code could ship incrementally; this
-- file removes them and tightens the invariants.
-- ═════════════════════════════════════════════════════════════════════════

-- ── drop dependents BEFORE the columns they reference ───────────────────
-- `schedule_slots_needs_review` reads `discipline` / `category` /
-- `audience_note` — all of which drop below. Postgres refuses to drop
-- those columns while the view holds them, so we remove the view first.
-- The view was a Phase 1 operator aid; it can never return rows once
-- modality_id is NOT NULL anyway.
DROP VIEW IF EXISTS schedule_slots_needs_review;

-- ── check_ins: drop program snapshot columns ─────────────────────────────
-- `program_id` / `program_name` are superseded by `modality_id` /
-- `modality_name` (WS1). `ON DELETE SET NULL` FK means the cascade drop
-- below is safe — no orphan cleanup needed.
ALTER TABLE check_ins
  DROP COLUMN IF EXISTS program_id,
  DROP COLUMN IF EXISTS program_name;

-- ── schedule_slots: drop legacy scalars ──────────────────────────────────
-- Every one of these is replaced by a field on `class_modalities`
-- (discipline / category), `class_levels` (level), or `class_audiences`
-- (min_age / max_age / allowed_gender / invite_only / audience_note).
ALTER TABLE schedule_slots
  DROP COLUMN IF EXISTS discipline,
  DROP COLUMN IF EXISTS level,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS min_age,
  DROP COLUMN IF EXISTS max_age,
  DROP COLUMN IF EXISTS allowed_gender,
  DROP COLUMN IF EXISTS invite_only,
  DROP COLUMN IF EXISTS audience_note,
  DROP COLUMN IF EXISTS program_id;

-- ── drop class_programs ──────────────────────────────────────────────────
-- CASCADE takes the (now-empty-of-code-references) FK from the just-dropped
-- `schedule_slots.program_id` column along with it.
DROP TABLE IF EXISTS class_programs CASCADE;

-- ── promote modality_id to NOT NULL ──────────────────────────────────────
-- Every slot was backfilled in Phase 1; every slot created since goes
-- through `create_schedule_slot_tx` which rejects NULL modality_id. We
-- check one more time before tightening the column — an errant NULL
-- would otherwise surface as a strange constraint error on next write.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schedule_slots WHERE modality_id IS NULL) THEN
    RAISE EXCEPTION 'schedule_slots have NULL modality_id; backfill before promoting to NOT NULL.';
  END IF;
  ALTER TABLE schedule_slots ALTER COLUMN modality_id SET NOT NULL;
END
$$;

