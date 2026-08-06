-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1.5 — Asset Library
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assets (
  id           SERIAL PRIMARY KEY,
  filename     TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url   TEXT NOT NULL,
  alt_text     TEXT NOT NULL DEFAULT '',
  mime_type    TEXT NOT NULL,
  size_bytes   INT  NOT NULL DEFAULT 0,
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "admin_all_assets" ON public.assets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Public can SELECT (needed to render public_url on site)
CREATE POLICY "public_read_assets" ON public.assets
  FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_assets_created_at ON public.assets (created_at DESC);
