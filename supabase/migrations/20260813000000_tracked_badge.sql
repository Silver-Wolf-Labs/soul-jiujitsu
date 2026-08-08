-- ─────────────────────────────────────────────────────────────────────────────
-- Badge tracker: the badge a member has picked as their active objective.
--
-- The portal already shows every unearned badge as a locked silhouette. That is
-- a wall of 30 goals, which is the same as no goal at all — so a member can now
-- pick ONE and have the app follow it: "37 / 50 clases". The videogame framing is
-- deliberate: choose a challenge, watch the bar move, get the payoff.
--
-- Shape: a single column on `members`, not a table.
--
--   • The relationship is one-to-one by definition. A member has exactly one
--     active objective (that is the whole point — a list of tracked badges is
--     the locked grid we already have), so a child table would carry a
--     UNIQUE(member_id) and exist only to hold one nullable integer.
--   • Every read of it is on a page that is already reading the member row
--     (portal home, kiosk profile), so a column is zero extra round trips.
--   • Clearing the objective is `SET NULL`, not a DELETE + the cascade
--     bookkeeping that goes with a table.
--
-- What a separate table WOULD buy is history — "badges I chased and abandoned" —
-- and nothing in this feature asks for that. If it is ever wanted, an append-only
-- `tracked_badge_history` table alongside this column is the additive change;
-- starting with the table now would be building the audit trail first and the
-- feature second.
--
-- ON DELETE SET NULL because deactivating or deleting a catalogue badge must not
-- delete members. The objective simply disappears and the member picks another.
--
-- IF NOT EXISTS on every statement: 20260811000000 is the standing lesson in this
-- repo that a migration recorded as applied whose DDL did not land cannot be
-- re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS tracked_badge_id INT;

-- The constraint is named EXPLICITLY, in its own statement, because the app
-- depends on the name: PostgREST embeds it as
-- `badges!members_tracked_badge_id_fkey (…)` so the join is unambiguous if
-- `members` ever gains a second reference to `badges`. Postgres would have
-- generated exactly this name for an inline REFERENCES, but "would have
-- generated" is not a contract, and the failure mode is a runtime PGRST error on
-- the portal home page rather than anything a typecheck would catch.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_tracked_badge_id_fkey'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_tracked_badge_id_fkey
      FOREIGN KEY (tracked_badge_id) REFERENCES public.badges(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.members.tracked_badge_id IS
  'Badge the member picked as their active objective, shown with a progress bar '
  'in /portal and on the kiosk profile. Set by the member themselves; NULL means '
  'no objective. Cleared automatically when the badge is earned (see '
  'trg_clear_tracked_badge_on_award).';

-- ── Eligibility, enforced in the database ───────────────────────────────────
--
-- Two badges must never become an objective:
--
--   secret = true — the badge exists to be a surprise. Offering it in a picker
--     spoils it, and the picker is not the only way in: `members` has an UPDATE
--     policy for the member's own row (member_update_own, 20240135500000), so a
--     crafted request with the publishable key could set any badge id. The
--     app-side filter is the UI; this is the rule.
--
--   active = false — a retired badge can never be earned, so its bar can never
--     move. A tracker stuck at 0 forever reads as a broken feature.
--
-- Its own trigger rather than a branch inside
-- prevent_member_sensitive_column_update(): that function returns NEW early for
-- the service role (auth.uid() IS NULL) and for admins, which is right for
-- "columns members may not touch" and wrong here — this is a product invariant,
-- and the sanctioned write path (setOwnTrackedBadge) goes through the service
-- client precisely because every other own-data write in that file does. A check
-- that the service role skips would be a check the app never actually runs.
--
-- A CHECK constraint cannot express this: it would have to read another table.
CREATE OR REPLACE FUNCTION public.enforce_tracked_badge_eligible()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  -- Clearing the objective is always allowed.
  IF NEW.tracked_badge_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT secret, active INTO b FROM badges WHERE id = NEW.tracked_badge_id;

  -- No row: the FK will reject it in a moment with a better message than anything
  -- raised here. `NOT FOUND` rather than `b IS NULL` — reading a field off an
  -- unassigned RECORD raises, so the check has to come before b.secret is touched.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF b.secret THEN
    RAISE EXCEPTION 'A secret badge cannot be tracked as an objective (badge %)',
      NEW.tracked_badge_id;
  END IF;

  IF NOT b.active THEN
    RAISE EXCEPTION 'An inactive badge cannot be tracked as an objective (badge %)',
      NEW.tracked_badge_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tracked_badge_eligible ON public.members;

CREATE TRIGGER trg_enforce_tracked_badge_eligible
  BEFORE INSERT OR UPDATE OF tracked_badge_id ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tracked_badge_eligible();

-- ── Earning the badge completes the objective ───────────────────────────────
--
-- The third thing that must never be an objective is a badge the member already
-- holds. Enforcing that in the eligibility trigger above would be a half-measure:
-- it is true at the moment of choosing and then goes stale the instant the badge
-- is earned, leaving a permanently-full progress bar on the page.
--
-- So it is enforced by the award instead. The objective is cleared when the badge
-- lands, which is also the behaviour the videogame framing implies — the
-- challenge is completed and you pick the next one.
--
-- AFTER INSERT, so it cannot interfere with the award itself: awarding is
-- deliberately non-fatal in check-in-core (a member's attendance must never fail
-- because gamification did), and a BEFORE trigger that raised here would take the
-- check-in down with it.
--
-- The celebration is unaffected: it reads member_badges.seen_at, not this column.
CREATE OR REPLACE FUNCTION public.clear_tracked_badge_on_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members
  SET    tracked_badge_id = NULL
  WHERE  id = NEW.member_id
    AND  tracked_badge_id = NEW.badge_id;
  RETURN NULL;   -- AFTER trigger; the return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_tracked_badge_on_award ON public.member_badges;

CREATE TRIGGER trg_clear_tracked_badge_on_award
  AFTER INSERT ON public.member_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_tracked_badge_on_award();
