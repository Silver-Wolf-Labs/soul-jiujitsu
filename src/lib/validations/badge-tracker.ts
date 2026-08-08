import { z } from "zod";

/**
 * Picking (or clearing) the badge a member is chasing.
 *
 * `null` is a real value, not a missing one: it is how the member clears their
 * objective. So the field is `.nullable()` rather than `.optional()` — an absent
 * key is a malformed request, while an explicit null is "no goal".
 *
 * No member id. The action resolves the caller from their session; accepting one
 * would hand an authorization decision to the client, which is the same reason
 * leaderboardOptOutSchema doesn't take one either.
 *
 * Eligibility (not secret, not already earned, still active) is NOT expressed
 * here. Two of those three are facts about other rows in the database that a zod
 * schema cannot see, and the third would be a lie by the time the form was
 * submitted. They are checked in the action and, for the two that are security
 * rather than UX, again by a trigger in 20260813000000_tracked_badge.sql.
 */
export const trackedBadgeSchema = z.object({
  badge_id: z.number().int().positive().nullable(),
});

export type TrackedBadgeInput = z.infer<typeof trackedBadgeSchema>;
