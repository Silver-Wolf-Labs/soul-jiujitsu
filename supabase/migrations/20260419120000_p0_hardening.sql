-- ═════════════════════════════════════════════════════════════════════════
-- P0 Production Hardening — schema support
--
-- One migration, all hardening-sprint tables. Shipped together because
-- the MFA, roles, audit-trigger, and suppressions tables cross-reference
-- each other (e.g. the audit-trigger blocks DELETE on audit_logs which
-- the MFA flow writes to).
--
-- Additive only. No existing data is modified beyond:
--   - `profiles.role` CHECK is widened to accept 'owner' / 'manager'
--   - Existing `admin` rows are promoted to `owner` (single-admin today
--     = single-owner tomorrow)
-- Companion docs: docs/hardening-sprint-HLD.md, LLD.md.
-- ═════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- 1. Expand role enum: admin|staff|member → add owner, manager
-- ══════════════════════════════════════════════════════════════════════
-- Widening the CHECK is a drop+recreate because Postgres doesn't
-- support "ADD TO CHECK" directly. Existing 'admin' rows migrate to
-- 'owner' (single-admin today = single-owner tomorrow; the owner can
-- manually demote to 'manager' where appropriate after rollout).

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE public.profiles SET role = 'owner' WHERE role = 'admin';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'manager', 'admin', 'staff', 'member'));

-- Note: 'admin' kept in the enum for backward compat with any row that
-- might have slipped through. The role helpers (see
-- src/lib/supabase/require-role.ts) treat 'admin' as equivalent to
-- 'owner' during the transition, and a separate cleanup migration
-- drops 'admin' from the CHECK once no rows remain.

-- Update is_admin() to recognize owner + manager + legacy admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('owner', 'manager', 'admin') OR is_admin = true)
  )
$$;

-- New helper: is_owner() — sharper gate for dangerous ops (delete
-- member, change billing, edit waiver templates, etc.)
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'owner' OR is_admin = true)
  )
$$;

-- Track MFA enrollment state on profiles so the admin UI can show "2FA: on/off"
-- without a separate query per render. Populated by the enrollment
-- flow (src/components/admin/TwoFactorEnrollment.tsx).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_enrolled    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;

-- ══════════════════════════════════════════════════════════════════════
-- 2. admin_mfa_challenges — server-side timestamp for requireFreshMfa()
-- ══════════════════════════════════════════════════════════════════════
-- Replaces user_metadata.mfa_last_challenge_at (which was client-
-- writable — a critical AAL1 → bypass path). All writes go through
-- the service-role client after a verified TOTP challenge. Reads are
-- service-role only too; no user or anon policies exist. An explicit
-- deny-all policy documents the intent so a future regression can't
-- silently expose it.

CREATE TABLE IF NOT EXISTS admin_mfa_challenges (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_challenged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_challenge_ip    INET,
  last_challenge_ua    TEXT
);
ALTER TABLE admin_mfa_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny all non-service-role" ON admin_mfa_challenges;
CREATE POLICY "deny all non-service-role"
  ON admin_mfa_challenges FOR ALL
  USING (false)
  WITH CHECK (false);

-- ══════════════════════════════════════════════════════════════════════
-- 3. mfa_recovery_codes — hashed one-time recovery codes
-- ══════════════════════════════════════════════════════════════════════
-- Ten codes per enrolled admin. Hashed with argon2id (server-side, see
-- src/lib/mfa/recovery-codes.ts). Burned codes keep their `used_at`
-- timestamp for audit — never deleted. Re-enrollment generates a fresh
-- set and marks the previous set 'replaced_at' (all-at-once revocation).

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash    TEXT NOT NULL,                          -- argon2id hash
  label        TEXT,                                   -- e.g. "Code 3" for UI display
  used_at      TIMESTAMPTZ,
  replaced_at  TIMESTAMPTZ,                            -- set when the batch is regenerated
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_active_idx
  ON mfa_recovery_codes(user_id)
  WHERE used_at IS NULL AND replaced_at IS NULL;

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny all non-service-role" ON mfa_recovery_codes;
CREATE POLICY "deny all non-service-role"
  ON mfa_recovery_codes FOR ALL
  USING (false)
  WITH CHECK (false);

-- ══════════════════════════════════════════════════════════════════════
-- 4. auth_attempt_log — track login attempts for failed-login alerting
-- ══════════════════════════════════════════════════════════════════════
-- Written from the app side (not Supabase Auth which doesn't expose
-- hooks). Keyed on lowercased email so the 5-failures-in-15-min check
-- is case-insensitive. `ok=false` rows power the alert trigger.

CREATE TABLE IF NOT EXISTS auth_attempt_log (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  ip            INET,
  user_agent    TEXT,
  ok            BOOLEAN NOT NULL,
  failure_code  TEXT,                -- 'bad_password', 'no_user', 'rate_limited', 'mfa_failed', etc.
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempt_log_email_time_idx
  ON auth_attempt_log (LOWER(email), attempted_at DESC);
CREATE INDEX IF NOT EXISTS auth_attempt_log_recent_failures_idx
  ON auth_attempt_log (LOWER(email), attempted_at DESC)
  WHERE ok = FALSE;

ALTER TABLE auth_attempt_log ENABLE ROW LEVEL SECURITY;
-- Service-role only. App server logs attempts via service client.
DROP POLICY IF EXISTS "deny all non-service-role" ON auth_attempt_log;
CREATE POLICY "deny all non-service-role"
  ON auth_attempt_log FOR ALL USING (false) WITH CHECK (false);

-- 30-day retention — enough for forensics, cheap to maintain.
-- Owner can run this manually or via pg_cron if available.
-- Kept as a comment template; enable via separate pg_cron migration
-- when the extension is on.
-- SELECT cron.schedule('prune-auth-log', '0 4 * * *',
--   $$ DELETE FROM auth_attempt_log WHERE attempted_at < now() - INTERVAL '30 days' $$);

-- ══════════════════════════════════════════════════════════════════════
-- 5. email_suppressions — SES bounce / complaint handler destination
-- ══════════════════════════════════════════════════════════════════════
-- When SES delivers a bounce or complaint notification to our
-- /api/ses/notifications handler, the recipient email goes here.
-- Auth layer checks this table before sending (via a pre-send hook
-- in outbound mail helpers) so we never re-deliver to bad addresses.
-- AWS suspends SES at > 5% bounce rate; this is the mitigation.

CREATE TABLE IF NOT EXISTS email_suppressions (
  email          TEXT PRIMARY KEY,            -- lowercased on insert
  reason         TEXT NOT NULL
                   CHECK (reason IN ('bounce', 'complaint', 'manual', 'rejected')),
  bounce_type    TEXT,                        -- 'Permanent' | 'Transient' | 'Undetermined'
  bounce_subtype TEXT,                        -- 'General' | 'MailboxFull' | 'Suppressed' | ...
  suppressed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source         TEXT NOT NULL DEFAULT 'ses',
  raw_payload    JSONB
);

ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;

-- Owner/manager can read + clear suppressions (e.g., member says
-- "I fixed my inbox, please try again"). Deletions are audit-logged
-- via the audit_logs trigger on the app side.
DROP POLICY IF EXISTS "owner_manager_read_suppressions" ON email_suppressions;
CREATE POLICY "owner_manager_read_suppressions"
  ON email_suppressions FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "owner_delete_suppressions" ON email_suppressions;
CREATE POLICY "owner_delete_suppressions"
  ON email_suppressions FOR DELETE TO authenticated
  USING (public.is_owner());

-- Service-role client writes from the SES webhook handler.

-- ══════════════════════════════════════════════════════════════════════
-- 6. data_requests — DSAR intake (D3)
-- ══════════════════════════════════════════════════════════════════════
-- Member-visible form at /privacy/request writes here after email
-- verification. Admin queue UI in /admin/(protected)/data-requests
-- resolves them with one-click export / delete / manual.

CREATE TABLE IF NOT EXISTS data_requests (
  id               BIGSERIAL PRIMARY KEY,
  member_id        INT REFERENCES members(id) ON DELETE SET NULL,  -- survives deletion
  request_email    TEXT NOT NULL,                                  -- snapshot; lowercased
  request_type     TEXT NOT NULL
                     CHECK (request_type IN ('export', 'delete', 'correct', 'other')),
  message          TEXT,                                           -- member's free-text
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at      TIMESTAMPTZ,
  verification_token TEXT,                                         -- emailed to member; nulled on verify
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'in_progress', 'resolved', 'denied', 'auto_deleted')),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES auth.users(id),
  resolution_note  TEXT,
  export_s3_key    TEXT,                                           -- for 'export' requests
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_requests_pending_idx
  ON data_requests(created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS data_requests_email_idx
  ON data_requests(LOWER(request_email));

ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;

-- Service-role only from app side; the intake form + admin UI both go
-- through server actions with explicit gates. No direct user access.
DROP POLICY IF EXISTS "deny all non-service-role" ON data_requests;
CREATE POLICY "deny all non-service-role"
  ON data_requests FOR ALL USING (false) WITH CHECK (false);

-- ══════════════════════════════════════════════════════════════════════
-- 7. audit_logs — append-only enforcement
-- ══════════════════════════════════════════════════════════════════════
-- Block DELETE + UPDATE on audit_logs at the database layer, even for
-- service-role. Closes Security C4 from the hardening review: a
-- compromised admin could otherwise cover their tracks by scrubbing
-- the audit trail.
--
-- Emergency carveout: a separate `ALLOW_AUDIT_LOG_MUTATION` server-
-- level GUC can be set by a DBA for legitimate data corrections
-- (GDPR RTBF, accidental PII logged by mistake). Not exposed to the
-- app — has to be set at the psql connection via `SET LOCAL ...`.

CREATE OR REPLACE FUNCTION public.audit_logs_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('souljj.allow_audit_log_mutation', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only (attempt: %)', TG_OP
    USING HINT = 'Audit trail integrity. Contact DBA if correction is legitimate.';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_block_update ON audit_logs;
CREATE TRIGGER audit_logs_block_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_block_mutation();

DROP TRIGGER IF EXISTS audit_logs_block_delete ON audit_logs;
CREATE TRIGGER audit_logs_block_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_block_mutation();

-- ══════════════════════════════════════════════════════════════════════
-- 8. Audit log action taxonomy expansion (documentation only — enum is
--    TEXT-typed, just noting the new codes for grep discoverability)
-- ══════════════════════════════════════════════════════════════════════
-- New audit log action codes this sprint introduces (all optional;
-- audit_logs.action is a free-text column today):
--   mfa.enrolled              user enrolled a TOTP factor
--   mfa.unenrolled            user removed a factor
--   mfa.challenge_success     AAL2 step-up succeeded
--   mfa.challenge_failed      AAL2 step-up failed (wrong code)
--   mfa.recovery_code_used    one-time recovery code burned
--   mfa.recovery_codes_regenerated  user regenerated their batch of 10
--   billing.portal_opened     member clicked "Manage billing"
--   billing.subscription_cancelled  webhook confirmed cancel
--   dsar.intake_received      member submitted /privacy/request
--   dsar.export_generated     admin produced export ZIP
--   dsar.deletion_executed    admin ran delete_member_tx from queue
--   email.suppression_added   SES bounce/complaint landed
--   email.suppression_cleared owner manually cleared
--   login.new_device_notification  first login from new IP+UA combo
--   login.repeated_failure_alert   5 failed attempts in 15 min
