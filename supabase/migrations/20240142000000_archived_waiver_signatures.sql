-- Archive table for waiver signatures preserved after member deletion.
-- Stores denormalized member info since the member row will be gone.

CREATE TABLE IF NOT EXISTS public.archived_waiver_signatures (
  id              SERIAL PRIMARY KEY,
  original_id     INT NOT NULL,
  member_id       INT NOT NULL,
  member_name     TEXT NOT NULL,
  member_email    TEXT NOT NULL,
  template_id     INT REFERENCES public.waiver_templates(id),
  template_version INT NOT NULL,
  signed_at       TIMESTAMPTZ NOT NULL,
  ip_address      TEXT,
  snapshot_md     TEXT NOT NULL,
  signature_type  TEXT,
  typed_initials  TEXT,
  signature_path  TEXT,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_by     TEXT
);

-- RLS: only admins can read archives
ALTER TABLE public.archived_waiver_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_archived_waivers"
  ON public.archived_waiver_signatures
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true))
  );
