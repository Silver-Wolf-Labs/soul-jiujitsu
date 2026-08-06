-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Members, Membership Plans, Member Memberships
-- ─────────────────────────────────────────────────────────────────────────────

-- Member status enum
CREATE TYPE public.member_status AS ENUM ('prospect', 'trial', 'active', 'inactive', 'suspended');

-- Membership status enum
CREATE TYPE public.membership_status AS ENUM ('trialing', 'active', 'paused', 'canceled', 'past_due');

-- Members table
CREATE TABLE IF NOT EXISTS public.members (
  id                        SERIAL PRIMARY KEY,
  user_id                   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  email                     TEXT NOT NULL,
  phone                     TEXT,
  status                    public.member_status NOT NULL DEFAULT 'prospect',
  emergency_contact_name    TEXT,
  emergency_contact_phone   TEXT,
  notes                     TEXT,
  communication_opt_in      BOOLEAN NOT NULL DEFAULT true,
  waiver_signed_at          TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_members_email ON public.members (lower(email));
CREATE INDEX idx_members_status ON public.members (status);
CREATE INDEX idx_members_user_id ON public.members (user_id);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_members" ON public.members
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "member_read_own" ON public.members
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "member_update_own" ON public.members
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Membership plans (operational, not marketing)
CREATE TABLE IF NOT EXISTS public.membership_plans (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  price_cents         INT NOT NULL,
  billing_interval    TEXT NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
  trial_days          INT NOT NULL DEFAULT 0,
  max_classes_per_week INT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_membership_plans" ON public.membership_plans
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "public_read_active_plans" ON public.membership_plans
  FOR SELECT USING (status = 'active');

-- Plan price history — every price change is logged
CREATE TABLE IF NOT EXISTS public.plan_price_history (
  id            SERIAL PRIMARY KEY,
  plan_id       INT NOT NULL REFERENCES public.membership_plans(id) ON DELETE CASCADE,
  old_price_cents INT NOT NULL,
  new_price_cents INT NOT NULL,
  scope         TEXT NOT NULL CHECK (scope IN ('new_only', 'all_current')),
  changed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_price_history" ON public.plan_price_history
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Member memberships
CREATE TABLE IF NOT EXISTS public.member_memberships (
  id                    SERIAL PRIMARY KEY,
  member_id             INT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  plan_id               INT NOT NULL REFERENCES public.membership_plans(id),
  status                public.membership_status NOT NULL DEFAULT 'active',
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at               TIMESTAMPTZ,
  canceled_at           TIMESTAMPTZ,
  locked_price_cents    INT NOT NULL,
  override_price_cents  INT,
  override_note         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_member_memberships_member ON public.member_memberships (member_id);
CREATE INDEX idx_member_memberships_plan ON public.member_memberships (plan_id);
CREATE INDEX idx_member_memberships_status ON public.member_memberships (status);

ALTER TABLE public.member_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_memberships" ON public.member_memberships
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "member_read_own_membership" ON public.member_memberships
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
