-- Signature storage: new columns on waiver_signatures + private storage bucket
-- for drawn signature PNG files.

-- ── New columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.waiver_signatures
  ADD COLUMN IF NOT EXISTS signature_type TEXT
    CHECK (signature_type IN ('typed', 'drawn'));

COMMENT ON COLUMN public.waiver_signatures.signature_type
  IS 'How the member signed: typed (initials) or drawn (finger/mouse canvas)';

ALTER TABLE public.waiver_signatures
  ADD COLUMN IF NOT EXISTS typed_initials TEXT;

COMMENT ON COLUMN public.waiver_signatures.typed_initials
  IS 'Member-typed initials when signature_type = ''typed''';

ALTER TABLE public.waiver_signatures
  ADD COLUMN IF NOT EXISTS signature_path TEXT;

COMMENT ON COLUMN public.waiver_signatures.signature_path
  IS 'Supabase Storage object path (bucket: signatures) for drawn PNG, when signature_type = ''drawn''';

-- ── Storage bucket ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures',
  'signatures',
  false,          -- private: no public URL access
  102400,         -- 100 KB max per file (400×200 PNG is typically < 10 KB)
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS ───────────────────────────────────────────────────────────────

-- Admins can read all signature files (e.g. for audits)
DROP POLICY IF EXISTS "admin_read_signature_files" ON storage.objects;
CREATE POLICY "admin_read_signature_files"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR is_admin = true)
    )
  );

-- Service role (used by server actions) can manage all signature files
DROP POLICY IF EXISTS "service_manage_signature_files" ON storage.objects;
CREATE POLICY "service_manage_signature_files"
  ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'signatures')
  WITH CHECK (bucket_id = 'signatures');
