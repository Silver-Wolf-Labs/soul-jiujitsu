-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Logs
--
-- Permanent record of all admin mutations. Retention: 3 years.
-- Payload stores only the changed fields (lean, not full row snapshots).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  TEXT,                          -- denormalized for readability after user deletion
  action      TEXT         NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'TOGGLE')),
  table_name  TEXT         NOT NULL,
  record_id   TEXT,                          -- stringified so it works for any PK type
  payload     JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for the admin viewer (filter by table, action, date)
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table       ON audit_logs (table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user        ON audit_logs (user_id, created_at DESC);

-- RLS: admins can read and write; anon cannot access at all
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_audit_logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_insert_audit_logs" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3-year retention cleanup via pg_cron
-- Runs at 3am UTC every day. Deletes rows older than 3 years.
--
-- Guarded because pg_cron is not enabled by default on a new Supabase project,
-- and an unguarded `cron.schedule` aborts this migration's transaction — which
-- takes down `audit_logs` and every migration after it. That is exactly what
-- happened on a fresh staging project: 5 of 69 migrations applied and the push
-- stopped here. `20260419120000_p0_hardening.sql` already handles the same
-- problem by leaving its schedule commented out.
--
-- To turn the retention job on: Dashboard → Database → Extensions → enable
-- `pg_cron`, then re-run this block. Without it the table still works; rows
-- simply accumulate rather than being pruned.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'delete-old-audit-logs',
      '0 3 * * *',
      $job$DELETE FROM public.audit_logs WHERE created_at < NOW() - INTERVAL '3 years'$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — skipping audit_logs retention job. Enable the extension and re-run to activate 3-year pruning.';
  END IF;
END $$;
