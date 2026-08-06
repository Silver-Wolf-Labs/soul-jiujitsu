-- Add mat/room designation to schedule entries
ALTER TABLE schedule
  ADD COLUMN IF NOT EXISTS area VARCHAR(8) NULL;

COMMENT ON COLUMN schedule.area IS 'Optional area/mat/room designation, max 8 chars (e.g. "Mat 1", "Room A-3")';
