import { z } from "zod";

/**
 * Adding or removing one of the badges a member is chasing.
 *
 * `badge_id` is no longer nullable, which is the whole shape change from the
 * single-objective version. When there was one slot, `null` was a real value — it
 * was how the member cleared their goal. With up to three (20260816000000) the
 * operations are add-this-one and remove-this-one, and both name a badge; "clear
 * everything" is not a gesture the UI offers, because a member with three goals
 * who wants to drop one would be one mis-tap from losing all three.
 *
 * No member id. The actions resolve the caller from their session; accepting one
 * would hand an authorization decision to the client, which is the same reason
 * leaderboardOptOutSchema doesn't take one either.
 *
 * The three-goal CAP is not expressed here either. A zod schema validates one
 * request in isolation and the cap is a fact about rows already in the table — it
 * is checked in the action and, decisively, by `PRIMARY KEY (member_id, slot)`
 * plus `CHECK (slot BETWEEN 1 AND 3)` in the database, which is the only place
 * that holds under concurrent inserts.
 *
 * Eligibility (not secret, not already earned, still active) is likewise absent.
 * Two of those three are facts about other rows that a schema cannot see, and the
 * third would be a lie by the time the form was submitted. They are checked in the
 * action and, for the two that are security rather than UX, again by
 * trg_enforce_tracked_badge_eligible.
 */
export const trackedBadgeSchema = z.object({
  badge_id: z.number().int().positive(),
});

export type TrackedBadgeInput = z.infer<typeof trackedBadgeSchema>;
