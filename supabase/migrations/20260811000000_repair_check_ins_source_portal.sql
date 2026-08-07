-- Repair: allow 'portal' as a check-in source.
--
-- WHY THIS EXISTS WHEN 20260809000000 ALREADY DOES IT
-- --------------------------------------------------
-- That migration contains exactly this ALTER TABLE, and it is recorded as
-- applied in staging's migration history — but the constraint on the live table
-- still read CHECK (source IN ('kiosk', 'admin')). Measured, not inferred: a
-- service_role INSERT with source='kiosk' and source='admin' both succeeded and
-- source='portal' was rejected with
--
--     new row for relation "check_ins" violates check constraint
--     "check_ins_source_check"
--
-- while `current_member_id`, `get_team_leaderboard` and `get_team_activity` from
-- the SAME migration file all existed and returned rows. So the function bodies
-- landed and the table alteration did not.
--
-- The consequence is worse than a missing constraint would be: because the
-- version is already in the history table, `supabase db push` reports
-- "up to date" and will never run those statements again. A migration recorded
-- as applied is, for tooling purposes, unrepeatable — the only way to converge
-- the schema is a NEW version, which is what this file is. Editing
-- 20260809000000 in place would fix nothing on any database that has already
-- recorded it, including this one.
--
-- Every statement is written to be safe to run on a database that is already
-- correct, since production has not been migrated yet and will get both files.
--
-- The user-visible symptom was that the self check-in button on /portal failed
-- with the raw Postgres message above: the feature shipped in application code
-- and was rejected by the database.

ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_source_check;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_source_check
  CHECK (source IN ('kiosk', 'admin', 'portal'));

COMMENT ON COLUMN public.check_ins.source IS
  'Where the check-in came from: kiosk (front-desk tablet), portal (member''s '
  'own device), or admin (recorded by staff on the member''s behalf).';

-- Fail loudly here rather than letting the portal fail in front of a member.
-- If the constraint still doesn't admit 'portal' after the statements above,
-- something is redefining it and the deploy should stop, not proceed quietly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.check_ins'::regclass
      AND conname  = 'check_ins_source_check'
      AND pg_get_constraintdef(oid) LIKE '%portal%'
  ) THEN
    RAISE EXCEPTION
      'check_ins_source_check does not admit source=''portal'' after repair; '
      'portal self check-in would fail at runtime';
  END IF;
END $$;
