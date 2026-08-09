-- ─────────────────────────────────────────────────────────────────────────────
-- Up to THREE tracked badges instead of one.
--
-- 20260813000000 put the objective in a single column on `members` and argued the
-- case for it at length: the relationship was one-to-one *by definition*, so a
-- child table would have carried a UNIQUE(member_id) and existed to hold one
-- nullable integer. That reasoning was correct and it is now obsolete — the
-- product decision changed, not the code. One goal turned out to be too few: a
-- member chasing "50 clases" has nothing to show for the Saturday they trained or
-- the streak they are on, so the single slot made every OTHER kind of progress
-- invisible. Three is the number that fits on a phone card and on the kiosk tab
-- without either becoming the wall of thirty silhouettes this feature exists to
-- escape.
--
-- ── Why the cap is a CHECK and not a counting trigger ───────────────────────
--
-- The obvious implementation is a BEFORE INSERT trigger that counts the member's
-- rows and raises above three. It is also wrong: two concurrent inserts each see
-- two existing rows, each decides there is room, and both commit. The cap becomes
-- an invariant that holds in testing and not in production, which is worse than no
-- cap because nothing downstream ever checks again.
--
-- So the slot is part of the key:
--
--     PRIMARY KEY (member_id, slot)  +  CHECK (slot BETWEEN 1 AND 3)
--
-- Three slots per member, enforced by the index itself. A fourth insert cannot
-- pick a legal slot that is free, so it fails on the primary key no matter how the
-- transactions interleave. There is no window and no lock to hold. `slot` is
-- MECHANISM, not meaning: display order is `created_at` (see below), so nothing in
-- the app cares which slot a goal landed in.
--
-- UNIQUE (member_id, badge_id) is the second half of the shape: without it a
-- member could put the same badge in two slots and watch two identical bars.
--
-- ── created_at, not slot, is the display order ──────────────────────────────
--
-- Slots get reused. A member with slots 1 and 3 filled who drops the first one
-- and picks another gets slot 1 back, and ordering by slot would silently move
-- that new goal to the top of the card. Ordering by created_at keeps the list in
-- the order the member built it, which is the only order they can predict.
--
-- ── ON DELETE CASCADE on both sides ────────────────────────────────────────
--
-- The old column used ON DELETE SET NULL so that retiring a catalogue badge could
-- never delete members. A row in a junction table expresses the same intent by
-- disappearing: the objective is gone and the member picks another, and the member
-- row is untouched because it is a different table. CASCADE on member_id for the
-- ordinary reason — a deleted member has no goals.
--
-- IF NOT EXISTS / IF EXISTS on every statement: 20260811000000 is the standing
-- lesson in this repo that a migration recorded as applied whose DDL did not land
-- cannot be re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_tracked_badges (
  member_id  INT         NOT NULL,
  badge_id   INT         NOT NULL,
  slot       INT         NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT member_tracked_badges_pkey PRIMARY KEY (member_id, slot),

  -- The cap. Changing the 3 here is the whole of "allow four goals" — the app
  -- reads its own limit from MAX_TRACKED_BADGES in src/lib/badge-progress.ts and
  -- the two must be changed together.
  CONSTRAINT member_tracked_badges_slot_range CHECK (slot BETWEEN 1 AND 3),

  CONSTRAINT member_tracked_badges_unique_badge UNIQUE (member_id, badge_id),

  CONSTRAINT member_tracked_badges_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE,

  -- Named explicitly, in the constraint list rather than inline, for the reason
  -- 20260813000000 named its own: the app embeds it as
  -- `badges!member_tracked_badges_badge_id_fkey (…)` so the join stays
  -- unambiguous if this table ever gains a second reference to `badges`.
  -- Postgres would generate exactly this name for an inline REFERENCES, but
  -- "would have generated" is not a contract and the failure mode is a runtime
  -- PGRST error on the portal home page, not something a typecheck would catch.
  CONSTRAINT member_tracked_badges_badge_id_fkey
    FOREIGN KEY (badge_id) REFERENCES public.badges(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.member_tracked_badges IS
  'Badges a member picked as active objectives, up to three, shown with progress '
  'bars in /portal and on the kiosk profile. Set by the member themselves. A row '
  'is removed automatically when the badge is earned (see '
  'trg_clear_tracked_badges_on_award).';

COMMENT ON COLUMN public.member_tracked_badges.slot IS
  'Mechanism, not meaning: PRIMARY KEY (member_id, slot) plus CHECK (slot BETWEEN '
  '1 AND 3) is what caps a member at three objectives without a race. Display '
  'order is created_at.';

-- ── Carry the existing objectives over ──────────────────────────────────────
--
-- Members have already picked goals since 20260813000000 was applied, and losing
-- them would be a silent data loss on a feature whose whole point is continuity —
-- a bar that resets to nothing is indistinguishable from a broken deploy.
--
-- Guarded on the column still existing so the migration is safe to re-run after
-- the DROP at the bottom has already happened.
--
-- Deliberately BEFORE the eligibility trigger is created, so it is not subject to
-- it. A badge the profe retired or made secret AFTER a member picked it would
-- otherwise abort the whole migration — and the member's answer to that is to pick
-- a different goal, not for the deploy to fail. Grandfathering an existing choice
-- is not the same decision as allowing a new one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'members'
      AND column_name  = 'tracked_badge_id'
  ) THEN
    INSERT INTO public.member_tracked_badges (member_id, badge_id, slot)
    SELECT id, tracked_badge_id, 1
    FROM   public.members
    WHERE  tracked_badge_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Same shape as member_badges: admins manage everything, members read their own.
--
-- With one deliberate difference — there is NO member-write policy. The old design
-- had to have one by accident: the objective lived on `members`, which carries an
-- UPDATE policy for a member's own row (member_update_own, 20240135500000), so any
-- holder of the publishable key could set tracked_badge_id directly and the
-- eligibility trigger below was the only thing standing in the way. Moving to its
-- own table closes that door: the sanctioned path (addOwnTrackedBadge) goes
-- through the service client like every other own-data write in that file, and
-- nothing else can write here at all.
--
-- That makes the trigger MORE important, not less. The service client bypasses RLS
-- entirely, so a policy would never have run on the app's own writes; the trigger
-- is the only check that does.

ALTER TABLE public.member_tracked_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage member_tracked_badges" ON public.member_tracked_badges;
DROP POLICY IF EXISTS "Members read own tracked badges"     ON public.member_tracked_badges;

CREATE POLICY "Admins manage member_tracked_badges" ON public.member_tracked_badges
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Members read own tracked badges" ON public.member_tracked_badges
  FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

-- ── Eligibility, enforced in the database ───────────────────────────────────
--
-- Unchanged in substance from 20260813000000, moved to the new table and reading
-- NEW.badge_id instead of NEW.tracked_badge_id. Two badges must never become an
-- objective:
--
--   secret = true — the badge exists to be a surprise, and a picker that lists it
--     spoils it more thoroughly than the locked grid ever could.
--
--   active = false — a retired badge can never be earned, so its bar can never
--     move. A tracker stuck at 0 forever reads as a broken feature.
--
-- A CHECK constraint cannot express either: both would have to read another table.
--
-- Still its own trigger rather than a branch inside
-- prevent_member_sensitive_column_update(), and now for a simpler reason than
-- before — that function is attached to `members` and this is a different table.

-- The old trigger goes FIRST, before the function it calls is redefined. It is
-- attached to `members` and the new body reads NEW.badge_id, a field a `members`
-- row does not have, so for the window between a replaced function and a dropped
-- trigger every UPDATE on members would raise. The Supabase SQL editor runs a
-- multi-statement batch in one implicit transaction, so that window is not
-- actually observable — but the ordering costs nothing and does not depend on
-- knowing that.
DROP TRIGGER IF EXISTS trg_enforce_tracked_badge_eligible ON public.members;

CREATE OR REPLACE FUNCTION public.enforce_tracked_badge_eligible()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  SELECT secret, active INTO b FROM badges WHERE id = NEW.badge_id;

  -- No row: the FK will reject it in a moment with a better message than anything
  -- raised here. `NOT FOUND` rather than `b IS NULL` — reading a field off an
  -- unassigned RECORD raises, so the check has to come before b.secret is touched.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF b.secret THEN
    RAISE EXCEPTION 'A secret badge cannot be tracked as an objective (badge %)',
      NEW.badge_id;
  END IF;

  IF NOT b.active THEN
    RAISE EXCEPTION 'An inactive badge cannot be tracked as an objective (badge %)',
      NEW.badge_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tracked_badge_eligible ON public.member_tracked_badges;

CREATE TRIGGER trg_enforce_tracked_badge_eligible
  BEFORE INSERT OR UPDATE OF badge_id ON public.member_tracked_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tracked_badge_eligible();

-- ── Earning the badge completes the objective ───────────────────────────────
--
-- The third thing that must never be an objective is a badge the member already
-- holds. Enforcing that in the eligibility trigger would be a half-measure: true
-- at the moment of choosing and stale the instant the badge is earned, leaving a
-- permanently-full progress bar on the page.
--
-- So the award clears it. With three slots this now frees ONE slot and leaves the
-- other two alone, which is the behaviour the videogame framing implies: the
-- challenge is completed, the others are still running, and there is room to pick
-- the next one.
--
-- AFTER INSERT, so it cannot interfere with the award itself: awarding is
-- deliberately non-fatal in check-in-core (a member's attendance must never fail
-- because gamification did), and a BEFORE trigger that raised here would take the
-- check-in down with it.
--
-- The celebration is unaffected: it reads member_badges.seen_at, not this table.
CREATE OR REPLACE FUNCTION public.clear_tracked_badge_on_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM member_tracked_badges
  WHERE  member_id = NEW.member_id
    AND  badge_id  = NEW.badge_id;
  RETURN NULL;   -- AFTER trigger; the return value is ignored
END;
$$;

-- Renamed with the table it now writes to, so the old name is dropped rather than
-- left pointing at a redefined function.
DROP TRIGGER IF EXISTS trg_clear_tracked_badge_on_award  ON public.member_badges;
DROP TRIGGER IF EXISTS trg_clear_tracked_badges_on_award ON public.member_badges;

CREATE TRIGGER trg_clear_tracked_badges_on_award
  AFTER INSERT ON public.member_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_tracked_badge_on_award();

-- ── Retire the single-objective column ──────────────────────────────────────
--
-- Last, and only after the backfill above has copied every value out of it.
--
-- DEPLOY ORDER MATTERS, in the opposite direction to the usual one: ship the
-- application code BEFORE applying this migration. The new code reads
-- member_tracked_badges and falls back to "no goals" when the table is absent
-- (both call sites are wrapped for exactly this, see the comments in
-- src/app/portal/page.tsx), so code-then-migration degrades to an empty tracker
-- for a few minutes. Migration-first would leave the old deployed code selecting
-- a column that no longer exists.
--
-- Dropping it rather than leaving it: a dead column that still looks like the
-- source of truth is how the next person ends up writing to it.
ALTER TABLE public.members
  DROP COLUMN IF EXISTS tracked_badge_id;
