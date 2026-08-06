-- Adds emergency_contact_relationship to members
-- Adds signature_data (base64 PNG data URL of drawn signature) to waiver_signatures

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT
  CHECK (emergency_contact_relationship IN (
    'spouse','partner','parent','sibling','child','friend','colleague','other'
  ));

COMMENT ON COLUMN public.members.emergency_contact_relationship
  IS 'Relationship of emergency contact to member';

ALTER TABLE public.waiver_signatures
  ADD COLUMN IF NOT EXISTS signature_data TEXT;

COMMENT ON COLUMN public.waiver_signatures.signature_data
  IS 'Base64 PNG data URL of the drawn signature';
