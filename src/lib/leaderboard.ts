/**
 * Display ranks for the portal team leaderboard.
 *
 * WHY THIS ISN'T JUST `index + 1`
 * ------------------------------
 * `get_team_leaderboard` hides members who set `leaderboard_opt_out` — from
 * everyone except themselves (see 20260812000000_leaderboard_opt_out.sql). A
 * member who opts out therefore keeps getting a board that contains one row
 * nobody else's board contains: their own.
 *
 * Numbering that list positionally would mean the opted-out member reads
 * different ranks than the rest of the gym for the *same* standings — everyone
 * sorted below them shifts down by one on their screen only. "I'm 7th" would
 * disagree with what their training partner sees, which is worse than showing no
 * number at all, because a wrong number looks authoritative.
 *
 * So when the viewer is hidden, their own row gets no rank (the UI renders a dash
 * and an "oculto" tag) and everyone else is numbered as if that row weren't
 * there. The result is byte-for-byte the ranking every other member sees.
 *
 * Pure on purpose: takes the rows and the flag, returns numbers. The flag comes
 * from the member's own `members` row rather than from the projection, because
 * the RPC's column set is mirrored by TeamMemberEntry and adding to it would
 * change the shape of every existing caller.
 */

/** The only field of a leaderboard row this needs. Keeps the test free of fixtures. */
type RankableRow = { is_self: boolean };

/**
 * One entry per input row, in the same order: the rank to display, or `null` for
 * the viewer's own row when they are hidden from the board.
 *
 * @param rows        Leaderboard rows, already sorted by the RPC (XP desc).
 * @param selfHidden  The viewer's `leaderboard_opt_out`.
 */
export function leaderboardDisplayRanks(
  rows: readonly RankableRow[],
  selfHidden: boolean
): (number | null)[] {
  // Not hidden → the list is the same list everyone else gets, so positional
  // numbering is already correct and cheap.
  if (!selfHidden) return rows.map((_, i) => i + 1);

  let rank = 0;
  return rows.map((row) => {
    // Only the viewer's own row is skipped. Other opted-out members were already
    // filtered out server-side, so they can't appear here and can't be
    // double-counted — and `is_self` is true for at most one row, because it is
    // `m.id = current_member_id()`.
    if (row.is_self) return null;
    rank += 1;
    return rank;
  });
}
