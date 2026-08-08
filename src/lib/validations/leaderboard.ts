import { z } from "zod";

/**
 * The desired state, not a "flip it" command.
 *
 * A parameterless toggle reads the current value and writes its negation, which
 * makes a double-tap on a slow phone connection land as two flips and leave the
 * member where they started — with no error to explain it. Sending the state the
 * member is asking for makes the action idempotent: the same request twice
 * produces the same result.
 *
 * No member id: the action resolves the caller from their session. Accepting one
 * would be an authorization decision handed to the client.
 */
export const leaderboardOptOutSchema = z.object({
  opt_out: z.boolean(),
});

export type LeaderboardOptOutInput = z.infer<typeof leaderboardOptOutSchema>;
