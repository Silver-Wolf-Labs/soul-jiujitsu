-- Nav items
CREATE TABLE IF NOT EXISTS public.nav_items (
  id            SERIAL PRIMARY KEY,
  label         TEXT NOT NULL,
  href          TEXT NOT NULL,
  display_order INT  NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nav_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_nav_items"   ON public.nav_items FOR SELECT USING (true);
CREATE POLICY "admin_write_nav_items"   ON public.nav_items FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin_update_nav_items"  ON public.nav_items FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "admin_delete_nav_items"  ON public.nav_items FOR DELETE TO authenticated USING (public.is_admin());

-- Footer items
CREATE TABLE IF NOT EXISTS public.footer_items (
  id            SERIAL PRIMARY KEY,
  label         TEXT NOT NULL,
  href          TEXT NOT NULL,
  group_name    TEXT NOT NULL DEFAULT 'Site',  -- 'Site' | 'Info' | 'Connect'
  display_order INT  NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.footer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_footer_items"   ON public.footer_items FOR SELECT USING (true);
CREATE POLICY "admin_write_footer_items"   ON public.footer_items FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin_update_footer_items"  ON public.footer_items FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "admin_delete_footer_items"  ON public.footer_items FOR DELETE TO authenticated USING (public.is_admin());

-- Seed nav items (mirrors NAV_LINKS constant as fallback)
INSERT INTO public.nav_items (label, href, display_order) VALUES
  ('Schedule',  '/#schedule',  1),
  ('Team',      '/#team',      2),
  ('Blog',      '/#blog',      3),
  ('Pricing',   '/#pricing',   4),
  ('FAQ',       '/#faq',       5),
  ('Contact',   '/#contact',   6)
ON CONFLICT DO NOTHING;

-- Seed footer items
INSERT INTO public.footer_items (label, href, group_name, display_order) VALUES
  ('Schedule',  '/#schedule',  'Site', 1),
  ('Team',      '/#team',      'Site', 2),
  ('Blog',      '/#blog',      'Site', 3),
  ('Pricing',   '/#pricing',   'Site', 4),
  ('FAQ',       '#faq',        'Info', 1),
  ('Contact',   '#contact',    'Info', 2),
  ('Subscribe', '#subscribe',  'Info', 3),
  ('Waiver',    '#',           'Info', 4)
ON CONFLICT DO NOTHING;
