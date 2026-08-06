import { z } from "zod";

export const blogPostSchema = z.object({
  title:     z.string().min(1, "Title is required").max(200),
  slug:      z.string().min(1, "Slug is required").max(100)
               .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  body:      z.string().min(1, "Body is required"),
  tag:       z.string().min(1, "Tag is required").max(50),
  author:    z.string().min(1, "Author is required").max(100),
  excerpt:   z.string().max(300).default(""),
  published: z.boolean(),
  // Accept both shapes — legacy callers pass `starts_at`/`expires_at` and
  // new admin form also supplies `display_order`. All optional server-side.
  starts_at:  z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  display_order: z.number().int().optional(),
});

export type BlogPostInput = z.infer<typeof blogPostSchema>;
