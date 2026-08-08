import { describe, it, expect } from "vitest";
import { leaderboardDisplayRanks } from "../leaderboard";

/** Positional shorthand: `self(2)` = a 5-row board whose 3rd row is the viewer. */
function board(size: number, selfIndex: number | null) {
  return Array.from({ length: size }, (_, i) => ({ is_self: i === selfIndex }));
}

describe("leaderboardDisplayRanks", () => {
  it("numbers a visible member's board positionally", () => {
    expect(leaderboardDisplayRanks(board(4, 1), false)).toEqual([1, 2, 3, 4]);
  });

  it("does not rank a hidden member's own row", () => {
    expect(leaderboardDisplayRanks(board(4, 1), true)).toEqual([1, null, 2, 3]);
  });

  // The whole point of the function. A hidden member's board carries one row
  // nobody else's does, so `index + 1` would show everyone below them a rank one
  // higher than the gym sees — the member would quote "I'm 3rd" at someone whose
  // screen says 2nd.
  it("gives everyone else the same ranks the rest of the gym sees", () => {
    const withSelf = leaderboardDisplayRanks(board(5, 2), true);
    // What another member gets: the same board minus the hidden row.
    const withoutSelf = leaderboardDisplayRanks(board(4, null), false);
    expect(withSelf.filter((r) => r !== null)).toEqual(withoutSelf);
  });

  it("handles the hidden member sitting first", () => {
    expect(leaderboardDisplayRanks(board(3, 0), true)).toEqual([null, 1, 2]);
  });

  it("handles the hidden member sitting last", () => {
    expect(leaderboardDisplayRanks(board(3, 2), true)).toEqual([1, 2, null]);
  });

  it("handles a hidden member alone on the board", () => {
    expect(leaderboardDisplayRanks(board(1, 0), true)).toEqual([null]);
  });

  it("returns an empty array for an empty board", () => {
    expect(leaderboardDisplayRanks([], false)).toEqual([]);
    expect(leaderboardDisplayRanks([], true)).toEqual([]);
  });

  // An admin-only account, or the flag being stale relative to the rows: hidden
  // but no is_self row came back. Numbering must not develop a gap for a row that
  // isn't there.
  it("numbers every row when hidden but no self row is present", () => {
    expect(leaderboardDisplayRanks(board(3, null), true)).toEqual([1, 2, 3]);
  });

  it("returns one entry per input row in every case", () => {
    for (const hidden of [true, false]) {
      for (let selfIndex = 0; selfIndex < 6; selfIndex++) {
        expect(leaderboardDisplayRanks(board(6, selfIndex), hidden)).toHaveLength(6);
      }
    }
  });

  it("does not mutate the rows it is given", () => {
    const rows = board(3, 1);
    const snapshot = JSON.stringify(rows);
    leaderboardDisplayRanks(rows, true);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
