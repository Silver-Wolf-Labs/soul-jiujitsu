-- Belt and stripe promotion history.
-- Every belt change or stripe addition is recorded here.

CREATE TABLE IF NOT EXISTS public.belt_history (
  id            SERIAL PRIMARY KEY,
  member_id     INT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  belt          TEXT NOT NULL CHECK (belt IN ('white','blue','purple','brown','black')),
  stripes       INT NOT NULL DEFAULT 0 CHECK (stripes >= 0 AND stripes <= 4),
  event_type    TEXT NOT NULL CHECK (event_type IN ('promotion','stripe','correction')),
  notes         TEXT,
  promoted_by   TEXT,          -- email of the admin who performed the action
  promoted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_belt_history_member ON public.belt_history(member_id, promoted_at DESC);

-- RLS
ALTER TABLE public.belt_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_belt_history"
  ON public.belt_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)));

CREATE POLICY "member_read_own_belt_history"
  ON public.belt_history FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
