-- Realtime for the portal's team feed.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- Subscribing to a table that isn't in the `supabase_realtime` publication is
-- SILENT: channel.subscribe() still reports SUBSCRIBED and no error is ever
-- raised — the events simply never arrive. Verified against staging before
-- writing this: an INSERT into check_ins with a live subscription delivered 0
-- events. The portal's fallback poll masked it, so the feed looked "real time"
-- while actually being up to 60 seconds stale.
--
-- WHAT THE CLIENT DOES WITH THESE EVENTS
-- --------------------------------------
-- Nothing except re-run the two feed RPCs (see TeamFeed.tsx). The payload is
-- discarded deliberately, which matters for privacy: Realtime filters rows
-- through RLS, and `check_ins` RLS lets a member read only their own row, so the
-- payload for someone else's check-in would arrive with its columns stripped
-- anyway. Treating the event purely as a "something changed" ping keeps the
-- SECURITY DEFINER RPCs as the single gatekeeper of what a member may see.
--
-- REPLICA IDENTITY
-- ----------------
-- DELETE events carry only the replica identity columns. The default is the
-- primary key, which is all the client needs here (it re-fetches rather than
-- reading the payload), so it is deliberately NOT widened to FULL — that would
-- ship every column of every deleted check-in over the socket for no benefit.

-- Idempotent: `ALTER PUBLICATION ... ADD TABLE` errors if the table is already a
-- member, which would break re-running the migration against a database where
-- someone added it through the dashboard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'check_ins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.check_ins;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'member_badges'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.member_badges;
  END IF;
END $$;
