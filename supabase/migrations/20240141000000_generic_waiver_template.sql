-- Replace the gym-specific waiver with a generic template.
-- The bootstrap script (or admin UI) customizes this for each gym.
-- Only runs if the existing waiver still contains the original seeded content.

DO $$
DECLARE
  v_existing_id INT;
  v_sig_count   INT;
BEGIN
  SELECT id INTO v_existing_id FROM public.waiver_templates WHERE active = true LIMIT 1;

  -- Only replace if no members have signed yet (fresh deployment)
  IF v_existing_id IS NOT NULL THEN
    SELECT count(*) INTO v_sig_count
    FROM public.waiver_signatures
    WHERE template_id = v_existing_id;

    IF v_sig_count = 0 THEN
      UPDATE public.waiver_templates SET
        title   = 'Membership & Liability Waiver',
        body_md = $WAIVER$
# Membership & Liability Waiver

I hereby enroll for training classes at **[GYM NAME]** located at **[GYM ADDRESS]**.

## Release & Waiver of Liability

In consideration for being permitted to participate in training and all related activities conducted by [GYM NAME], I, for myself, my spouse, legal representatives, heirs and assigns, hereby **release, waive and discharge** [GYM NAME], its administrators, officers, directors, volunteers and employees, other participants (the "releasees") and if applicable owners and lessors of the premises on which the activities take place, for all liability (whether known or unknown) to me, my spouse, legal representatives, heirs and assigns for any and all loss, damage, and any claim for damages resulting therefrom, on account of injury to my person, property, even injury resulting in my death, whether caused by the negligence and/or gross negligence of the releasees or otherwise while I am in said training or related activities.

## Covenant Not to Sue

Furthermore I agree and covenant not to institute or prosecute, or allow to be instituted or prosecuted, or in any way to aid the institution or prosecution of any lawsuit or claim against [GYM NAME] located at [GYM ADDRESS].

## Assumption of Risk & Indemnification

I hereby assume full responsibility for the risk of bodily injury, death or property damage due to negligence of the releasees or otherwise while in or upon [GYM NAME] premises and/or while participating in training activities.

I agree to indemnify the releasees and hold them each harmless from any and all loss, liability, damage or cost they may incur due to my presence at [GYM NAME] premises, whether caused by negligence of the releasees or otherwise. I will indemnify, save and hold harmless each of the releasees from any litigation expense, attorney fees, loss, liability, damage, or cost any releasee may incur as a result of such claim.

## Health Representation

I warrant I will not cause or attempt to cause any injury to myself or to any other participant, instructor or spectator. I represent and warrant that I have consulted a licensed physician and that I am in good health and that there are no physical or mental defects that would endanger my well-being or that of other participants or instructors.

## Cancellation Terms

I agree to the following cancellation terms: cancellation notification must be emailed or hand-delivered via certified or registered mail to the school. The notice must state that I no longer wish to be bound by this membership and must be delivered or mailed **30 days before the next billing payment**. The notice must be emailed to **[GYM EMAIL]**.

## Media Release

I give permission, free of charge, with no promise, representation or expectation of compensation, to use any photos, pictures, media, or likeness of myself for advertisements, instructional videos in any medium or manner, online training programs, or marketing materials to promote martial arts, sports, or fitness.

## Severability

I expressly agree that this release, waiver and indemnity agreement is intended to be as broad and inclusive as permitted by applicable law, and if any portion thereof is held invalid, it is agreed that the balance shall, notwithstanding, continue in full legal force and effect.

## Acknowledgment

I represent and warrant that I have carefully read the foregoing release and waiver and understand the contents thereof and sign this release as my own free act and further agree that no oral representations, statements or inducements apart from the foregoing written agreement have been made.
$WAIVER$,
        version = version + 1
      WHERE id = v_existing_id;
    END IF;
  ELSE
    -- No waiver exists yet — insert the generic template
    INSERT INTO public.waiver_templates (title, body_md, version, active, created_at)
    VALUES (
      'Membership & Liability Waiver',
      $WAIVER2$
# Membership & Liability Waiver

I hereby enroll for training classes at **[GYM NAME]** located at **[GYM ADDRESS]**.

## Release & Waiver of Liability

In consideration for being permitted to participate in training and all related activities conducted by [GYM NAME], I, for myself, my spouse, legal representatives, heirs and assigns, hereby **release, waive and discharge** [GYM NAME], its administrators, officers, directors, volunteers and employees, other participants (the "releasees") and if applicable owners and lessors of the premises on which the activities take place, for all liability (whether known or unknown) to me, my spouse, legal representatives, heirs and assigns for any and all loss, damage, and any claim for damages resulting therefrom, on account of injury to my person, property, even injury resulting in my death, whether caused by the negligence and/or gross negligence of the releasees or otherwise while I am in said training or related activities.

## Covenant Not to Sue

Furthermore I agree and covenant not to institute or prosecute, or allow to be instituted or prosecuted, or in any way to aid the institution or prosecution of any lawsuit or claim against [GYM NAME] located at [GYM ADDRESS].

## Assumption of Risk & Indemnification

I hereby assume full responsibility for the risk of bodily injury, death or property damage due to negligence of the releasees or otherwise while in or upon [GYM NAME] premises and/or while participating in training activities.

I agree to indemnify the releasees and hold them each harmless from any and all loss, liability, damage or cost they may incur due to my presence at [GYM NAME] premises, whether caused by negligence of the releasees or otherwise. I will indemnify, save and hold harmless each of the releasees from any litigation expense, attorney fees, loss, liability, damage, or cost any releasee may incur as a result of such claim.

## Health Representation

I warrant I will not cause or attempt to cause any injury to myself or to any other participant, instructor or spectator. I represent and warrant that I have consulted a licensed physician and that I am in good health and that there are no physical or mental defects that would endanger my well-being or that of other participants or instructors.

## Cancellation Terms

I agree to the following cancellation terms: cancellation notification must be emailed or hand-delivered via certified or registered mail to the school. The notice must state that I no longer wish to be bound by this membership and must be delivered or mailed **30 days before the next billing payment**. The notice must be emailed to **[GYM EMAIL]**.

## Media Release

I give permission, free of charge, with no promise, representation or expectation of compensation, to use any photos, pictures, media, or likeness of myself for advertisements, instructional videos in any medium or manner, online training programs, or marketing materials to promote martial arts, sports, or fitness.

## Severability

I expressly agree that this release, waiver and indemnity agreement is intended to be as broad and inclusive as permitted by applicable law, and if any portion thereof is held invalid, it is agreed that the balance shall, notwithstanding, continue in full legal force and effect.

## Acknowledgment

I represent and warrant that I have carefully read the foregoing release and waiver and understand the contents thereof and sign this release as my own free act and further agree that no oral representations, statements or inducements apart from the foregoing written agreement have been made.
$WAIVER2$,
      1,
      true,
      now()
    );
  END IF;
END $$;
