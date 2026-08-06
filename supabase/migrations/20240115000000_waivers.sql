-- Waiver templates
CREATE TABLE IF NOT EXISTS public.waiver_templates (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL,
  version     INT NOT NULL DEFAULT 1,
  active      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waiver_templates ENABLE ROW LEVEL SECURITY;
-- Admin full access
CREATE POLICY "admin_all_waiver_templates" ON public.waiver_templates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- Authenticated users (members) can read active templates
CREATE POLICY "auth_read_active_waiver_templates" ON public.waiver_templates
  FOR SELECT TO authenticated USING (active = true);

-- Waiver signatures
CREATE TABLE IF NOT EXISTS public.waiver_signatures (
  id                SERIAL PRIMARY KEY,
  member_id         INT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  template_id       INT NOT NULL REFERENCES public.waiver_templates(id),
  template_version  INT NOT NULL,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address        TEXT,
  snapshot_md       TEXT NOT NULL
);

ALTER TABLE public.waiver_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_waiver_signatures" ON public.waiver_signatures
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "member_insert_own_signature" ON public.waiver_signatures
  FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "member_read_own_signature" ON public.waiver_signatures
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

-- Seed a default waiver template
INSERT INTO public.waiver_templates (title, body_md, version, active) VALUES (
  'Liability Waiver & Membership Agreement',
  E'# Liability Waiver & Membership Agreement\n\n**Soul Jiu-Jitsu** ("Soul JJ")\n\n---\n\n## Assumption of Risk\n\nI understand and acknowledge that Brazilian Jiu-Jitsu and grappling martial arts involve physical contact and carry an inherent risk of injury, including but not limited to sprains, strains, fractures, and other injuries. I voluntarily assume all risks associated with participation.\n\n## Release of Liability\n\nI hereby release, waive, discharge, and covenant not to sue Soul JJ, its owners, instructors, employees, agents, and facility operators from any and all claims, demands, losses, or causes of action arising from my participation, including claims of negligence.\n\n## Medical Acknowledgment\n\nI confirm that I am in adequate physical condition to participate in martial arts training. I agree to inform instructors of any medical conditions or physical limitations prior to training.\n\n## Rules and Conduct\n\nI agree to follow all gym rules, instructor directions, and training protocols. I understand that unsafe or disrespectful behavior may result in immediate removal from the facility.\n\n## Photo and Media Release\n\nI grant permission to Soul JJ to use photographs or videos taken during training for promotional purposes unless I notify staff in writing of my objection.\n\n## Membership Terms\n\nI understand that membership dues are billed on a recurring basis per my selected plan. I am responsible for notifying Soul JJ of any changes to my payment method or to cancel my membership with 30 days written notice.',
  1,
  true
);
