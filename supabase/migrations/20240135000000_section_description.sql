-- Add display_description column to site_sections for per-section body text
ALTER TABLE site_sections
  ADD COLUMN IF NOT EXISTS display_description TEXT DEFAULT NULL;
