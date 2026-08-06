import { z } from "zod";

export const subscribeSchema = z.object({
  email:   z.string().email("Please enter a valid email address"),
  // Honeypot — must be empty
  website: z.string().max(0, "Invalid submission").optional(),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
