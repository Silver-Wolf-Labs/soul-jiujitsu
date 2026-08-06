-- Self-contained: creates waiver tables if they don't exist, then upserts
-- the authoritative waiver from docs/waiver.txt as version 2.
-- Safe to run multiple times.

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.waiver_templates (
  id          SERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  body_md     TEXT        NOT NULL,
  version     INT         NOT NULL DEFAULT 1,
  active      BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.waiver_signatures (
  id                SERIAL      PRIMARY KEY,
  member_id         INT         NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  template_id       INT         NOT NULL REFERENCES public.waiver_templates(id),
  template_version  INT         NOT NULL,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address        TEXT,
  snapshot_md       TEXT        NOT NULL
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.waiver_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiver_signatures   ENABLE ROW LEVEL SECURITY;

-- waiver_templates
DROP POLICY IF EXISTS "admin_all_waiver_templates"       ON public.waiver_templates;
DROP POLICY IF EXISTS "auth_read_active_waiver_templates" ON public.waiver_templates;

CREATE POLICY "admin_all_waiver_templates" ON public.waiver_templates
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "auth_read_active_waiver_templates" ON public.waiver_templates
  FOR SELECT TO authenticated
  USING (active = true);

-- waiver_signatures
DROP POLICY IF EXISTS "admin_all_waiver_signatures"  ON public.waiver_signatures;
DROP POLICY IF EXISTS "member_insert_own_signature"  ON public.waiver_signatures;
DROP POLICY IF EXISTS "member_read_own_signature"    ON public.waiver_signatures;

CREATE POLICY "admin_all_waiver_signatures" ON public.waiver_signatures
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "member_insert_own_signature" ON public.waiver_signatures
  FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

CREATE POLICY "member_read_own_signature" ON public.waiver_signatures
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

-- ── Upsert waiver content ─────────────────────────────────────────────────────

DO $$
DECLARE
  v_existing_id INT;
BEGIN
  SELECT id INTO v_existing_id FROM public.waiver_templates WHERE active = true LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.waiver_templates SET
      title    = 'Soul Jiu-Jitsu — Membership & Liability Waiver',
      body_md  = $WAIVER$
# Soul Jiu-Jitsu — Membership & Liability Waiver

I hereby enroll for Martial Arts training classes at **TODO_LEGAL_ENTITY**, herein known as **Soul Jiu-Jitsu** at TODO_FULL_ADDRESS.

## Release & Waiver of Liability

In consideration for being permitted to participate in Martial Arts training and all other related activities conducted by Soul Jiu-Jitsu, I, for myself, my spouse, legal representatives, heirs and assigns, hereby **release, waive and discharge** Soul Jiu-Jitsu, its administrators, officers, directors, volunteers and employees, other participants (the "releasees") and if applicable owners and lessors of the premises on which the activities take place, for all liability (whether known or unknown) to me, my spouse, legal representatives, heirs and assigns for any and all loss, damage, and any claim for damages resulting therefrom, on account of injury to my person, property, even injury resulting in my death, whether caused by the negligence and/or gross negligence of the releasees or otherwise while I am in said Martial Arts training or related activities.

## Covenant Not to Sue

Furthermore I agree and covenant not to institute or prosecute, or allow to be instituted or prosecuted, or in any way to aid the institution or prosecution of any lawsuit or claim against Soul Jiu-Jitsu located at TODO_FULL_ADDRESS.

## Assumption of Risk & Indemnification

I hereby assume full responsibility for the risk of bodily injury, death or property damage due to negligence of the releasees or otherwise while in or upon Soul Jiu-Jitsu premises and/or while participating in Martial Arts.

I agree to indemnify the releasees and hold them each harmless from any and all loss, liability, damage or cost they may incur due to my presence at Soul Jiu-Jitsu premises, whether caused by negligence of the releasees or otherwise. I will indemnify, save and hold harmless each of the releasees from any litigation expense, attorney fees, loss, liability, damage, or cost any releasee may incur as a result of such claim.

## Health Representation

I warrant I will not cause or attempt to cause any injury to myself or to any other participant, instructor or spectator. I represent and warrant that I have consulted a licensed physician and that I am in good health and that there are no physical or mental defects that would endanger my well-being or that of other participants or instructors.

## Cancellation Terms

I agree to the following cancellation terms: cancellation notification must be emailed or hand-delivered via certified or registered mail to the school. The notice must state that I no longer wish to be bound by this membership and must be delivered or mailed **30 days before the next billing payment**. The notice must be emailed to **TODO_EMAIL**.

## Media Release

I give permission, free of charge, with no promise, representation or expectation of compensation, to use any photos, pictures, media, or likeness of myself for advertisements, instructional videos in any medium or manner, online training programs, or marketing materials to promote martial arts, sports, or fitness.

## Severability

I expressly agree that this release, waiver and indemnity agreement is intended to be as broad and inclusive as permitted by the laws of the **State of Texas** and if any portion thereof is held invalid, it is agreed that the balance shall, notwithstanding, continue in full legal force and effect.

## Acknowledgment

I represent and warrant that I have carefully read the foregoing release and waiver and understand the contents thereof and sign this release as my own free act and further agree that no oral representations, statements or inducements apart from the foregoing written agreement have been made.
$WAIVER$,
      version  = 2
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.waiver_templates (title, body_md, version, active, created_at)
    VALUES (
      'Soul Jiu-Jitsu — Membership & Liability Waiver',
      $WAIVER2$
# Soul Jiu-Jitsu — Membership & Liability Waiver

I hereby enroll for Martial Arts training classes at **TODO_LEGAL_ENTITY**, herein known as **Soul Jiu-Jitsu** at TODO_FULL_ADDRESS.

## Release & Waiver of Liability

In consideration for being permitted to participate in Martial Arts training and all other related activities conducted by Soul Jiu-Jitsu, I, for myself, my spouse, legal representatives, heirs and assigns, hereby **release, waive and discharge** Soul Jiu-Jitsu, its administrators, officers, directors, volunteers and employees, other participants (the "releasees") and if applicable owners and lessors of the premises on which the activities take place, for all liability (whether known or unknown) to me, my spouse, legal representatives, heirs and assigns for any and all loss, damage, and any claim for damages resulting therefrom, on account of injury to my person, property, even injury resulting in my death, whether caused by the negligence and/or gross negligence of the releasees or otherwise while I am in said Martial Arts training or related activities.

## Covenant Not to Sue

Furthermore I agree and covenant not to institute or prosecute, or allow to be instituted or prosecuted, or in any way to aid the institution or prosecution of any lawsuit or claim against Soul Jiu-Jitsu located at TODO_FULL_ADDRESS.

## Assumption of Risk & Indemnification

I hereby assume full responsibility for the risk of bodily injury, death or property damage due to negligence of the releasees or otherwise while in or upon Soul Jiu-Jitsu premises and/or while participating in Martial Arts.

I agree to indemnify the releasees and hold them each harmless from any and all loss, liability, damage or cost they may incur due to my presence at Soul Jiu-Jitsu premises, whether caused by negligence of the releasees or otherwise. I will indemnify, save and hold harmless each of the releasees from any litigation expense, attorney fees, loss, liability, damage, or cost any releasee may incur as a result of such claim.

## Health Representation

I warrant I will not cause or attempt to cause any injury to myself or to any other participant, instructor or spectator. I represent and warrant that I have consulted a licensed physician and that I am in good health and that there are no physical or mental defects that would endanger my well-being or that of other participants or instructors.

## Cancellation Terms

I agree to the following cancellation terms: cancellation notification must be emailed or hand-delivered via certified or registered mail to the school. The notice must state that I no longer wish to be bound by this membership and must be delivered or mailed **30 days before the next billing payment**. The notice must be emailed to **TODO_EMAIL**.

## Media Release

I give permission, free of charge, with no promise, representation or expectation of compensation, to use any photos, pictures, media, or likeness of myself for advertisements, instructional videos in any medium or manner, online training programs, or marketing materials to promote martial arts, sports, or fitness.

## Severability

I expressly agree that this release, waiver and indemnity agreement is intended to be as broad and inclusive as permitted by the laws of the **State of Texas** and if any portion thereof is held invalid, it is agreed that the balance shall, notwithstanding, continue in full legal force and effect.

## Acknowledgment

I represent and warrant that I have carefully read the foregoing release and waiver and understand the contents thereof and sign this release as my own free act and further agree that no oral representations, statements or inducements apart from the foregoing written agreement have been made.
$WAIVER2$,
      2,
      true,
      now()
    );
  END IF;
END $$;
