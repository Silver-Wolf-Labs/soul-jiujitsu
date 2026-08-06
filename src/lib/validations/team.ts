import { z } from "zod";

export const teamMemberSchema = z.object({
  name:      z.string().min(1, "Name is required").max(100),
  role:      z.string().min(1, "Role is required").max(100),
  belt:      z.enum(["white", "blue", "purple", "brown", "black"]),
  bio:       z.string().max(2000).default(""),
  photo_url: z.string().url("Must be a valid URL").or(z.literal("")).default(""),
  slug:      z.string().min(1, "Slug is required").max(100)
               .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  order:     z.number().int().min(0),
  type:      z.enum(["owner", "head_coach", "instructor", "guest"]),
  active:    z.boolean(),
  /** Public /team visibility toggle. Defaults true for staff, false for guests. */
  visible_on_public_team: z.boolean().default(true),
  /** Optional ISO timestamp — public page auto-hides past this date. */
  visible_until: z.string().datetime().nullable().default(null),
});

export type TeamMemberInput = z.infer<typeof teamMemberSchema>;
