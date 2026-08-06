-- Add a metadata jsonb column to audit_logs for request context
-- (IP address, user-agent, etc.) that doesn't belong in the payload diff.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
