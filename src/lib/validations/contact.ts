import { z } from "zod";

export const contactSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50),
  last_name:  z.string().min(1, "Last name is required").max(50),
  email:      z.string().email("Please enter a valid email address"),
  message:    z.string().min(10, "Message must be at least 10 characters").max(2000),
  // Honeypot — must be empty; bots fill it in
  website:    z.string().max(0, "Invalid submission").optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;
