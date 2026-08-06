-- Optional age, gender, and invite-only restrictions on schedule slots
-- NULL = no restriction (open to all)
ALTER TABLE schedule_slots
  ADD COLUMN min_age        SMALLINT CHECK (min_age IS NULL OR min_age >= 0),
  ADD COLUMN max_age        SMALLINT CHECK (max_age IS NULL OR max_age >= 0),
  ADD COLUMN allowed_gender TEXT     CHECK (allowed_gender IN ('male', 'female')) DEFAULT NULL,
  ADD COLUMN invite_only    BOOLEAN  NOT NULL DEFAULT FALSE;

-- Ensure min <= max when both are set
ALTER TABLE schedule_slots
  ADD CONSTRAINT schedule_slots_age_range CHECK (
    min_age IS NULL OR max_age IS NULL OR min_age <= max_age
  );
