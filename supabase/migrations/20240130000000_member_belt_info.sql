-- ─────────────────────────────────────────────────────────────────────────────
-- Member belt/training info
-- Tracks BJJ rank, stripes, and training history for promotion tracking.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS belt               TEXT DEFAULT 'white'
    CHECK (belt IN ('white','blue','purple','brown','black')),
  ADD COLUMN IF NOT EXISTS stripes            SMALLINT NOT NULL DEFAULT 0
    CHECK (stripes BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS belt_awarded_at    DATE,          -- when current belt was awarded
  ADD COLUMN IF NOT EXISTS training_started_at DATE;         -- when member first started BJJ

COMMENT ON COLUMN public.members.belt              IS 'Current BJJ belt color';
COMMENT ON COLUMN public.members.stripes           IS 'Number of stripes on current belt (0–4)';
COMMENT ON COLUMN public.members.belt_awarded_at   IS 'Date the current belt was awarded';
COMMENT ON COLUMN public.members.training_started_at IS 'Date the member first started training BJJ';

-- ── Consistency rank function ─────────────────────────────────────────────────
-- Returns the member's rank (1 = most check-ins) and the total count of
-- members who have at least one check-in, for percentile display.
CREATE OR REPLACE FUNCTION get_member_consistency_rank(p_member_id INT)
RETURNS TABLE(rank BIGINT, total BIGINT)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH member_counts AS (
    SELECT member_id, COUNT(*) AS cnt
    FROM check_ins
    GROUP BY member_id
  ),
  this_member AS (
    SELECT COALESCE(
      (SELECT cnt FROM member_counts WHERE member_id = p_member_id),
      0
    ) AS my_count
  )
  SELECT
    (SELECT COUNT(*) + 1
     FROM member_counts
     WHERE cnt > (SELECT my_count FROM this_member))::BIGINT AS rank,
    (SELECT COUNT(DISTINCT member_id) FROM check_ins)::BIGINT AS total;
$$;

GRANT EXECUTE ON FUNCTION get_member_consistency_rank(INT) TO authenticated, anon;
