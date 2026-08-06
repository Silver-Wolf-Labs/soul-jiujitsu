-- Add waiver_status to members to make the waiver lifecycle explicit.
--
-- Before this column, there was no way to distinguish between:
--   a) a member who signed (waiver_signed_at IS NOT NULL)
--   b) a member who was never required to sign (no active template at signup)
--   c) a member whose signature is now outdated (new template activated)
--
-- Values:
--   'not_required' — no active waiver template existed when the member
--                    signed up; the gym may ask them to sign later.
--   'pending'      — a waiver exists (or has been updated) and the member
--                    has not yet signed it. Also the default for new rows
--                    until create_member_profile_tx sets the real value.
--   'signed'       — member has a current waiver_signatures row.
--   'expired'      — reserved for future use (e.g. periodic re-consent).

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS waiver_status text NOT NULL DEFAULT 'pending'
    CHECK (waiver_status IN ('not_required', 'pending', 'signed', 'expired'));

-- Backfill existing rows based on what we already know:
--   signed      → waiver_signed_at is set (they completed the flow)
--   pending     → no waiver_signed_at (we cannot distinguish 'not_required'
--                 retroactively, so 'pending' is the safe default — it will
--                 surface a banner prompting them to sign, which an admin can
--                 dismiss by activating/deactivating the template as needed)
UPDATE public.members
   SET waiver_status = 'signed'
 WHERE waiver_signed_at IS NOT NULL
   AND waiver_status = 'pending';
