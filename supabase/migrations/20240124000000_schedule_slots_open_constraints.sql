-- Drop the strict CHECK constraints on schedule_slots so category, discipline,
-- and level accept any custom string value (not just the original enum list).
-- Validation is now handled at the application layer.

ALTER TABLE schedule_slots
  DROP CONSTRAINT IF EXISTS schedule_slots_category_check,
  DROP CONSTRAINT IF EXISTS schedule_slots_discipline_check,
  DROP CONSTRAINT IF EXISTS schedule_slots_level_check;
