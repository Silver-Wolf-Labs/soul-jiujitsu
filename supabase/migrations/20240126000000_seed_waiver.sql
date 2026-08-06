-- Seed the Soul JJ liability waiver template.
-- Uses INSERT … ON CONFLICT DO NOTHING so it's safe to run multiple times.
-- If the template already exists (from migration 20240117), this is a no-op.

INSERT INTO waiver_templates (title, body_md, version, active, created_at)
SELECT
  'Soul Jiu-Jitsu — Membership & Liability Waiver',
  $WAIVER$
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
  1,
  true,
  now()
WHERE NOT EXISTS (SELECT 1 FROM waiver_templates LIMIT 1);
