-- Add birth month/year and gender to members
ALTER TABLE members
  ADD COLUMN birth_month SMALLINT CHECK (birth_month BETWEEN 1 AND 12),
  ADD COLUMN birth_year  SMALLINT CHECK (birth_year BETWEEN 1900 AND 2100),
  ADD COLUMN gender      TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));
