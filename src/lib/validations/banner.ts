import { z } from "zod";

export const bannerSchema = z.object({
  text:          z.string().min(1, "Banner text is required").max(500),
  color:         z.enum(["black", "blue", "purple", "brown", "yellow"]),
  display_order: z.number().int().min(0),
  active:        z.boolean(),
  starts_at:     z.string().nullable(),
  expires_at:    z.string().nullable(),
  section:       z.string().min(1, "Section is required"),
  expanded:      z.boolean().default(false),
});

export type BannerInput = z.infer<typeof bannerSchema>;
