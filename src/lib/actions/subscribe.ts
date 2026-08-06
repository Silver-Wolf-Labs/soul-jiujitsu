"use server";

import { createClient } from "@/lib/supabase/server";
import { subscribeSchema } from "@/lib/validations/subscribe";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult as SubscribeResult };

export async function addSubscriber(
  value: string,
  mode: "email" | "sms",
  honeypot?: string
): Promise<ActionResult> {
  // Honeypot filled — log and silently succeed to not tip off bots
  if (honeypot) {
    console.warn("[subscribe] honeypot triggered", { value, mode });
    return { success: true };
  }

  const trimmed = value.trim().toLowerCase();

  if (mode === "email") {
    const result = subscribeSchema.safeParse({ email: trimmed });
    if (!result.success) {
      return { success: false, error: result.error.issues[0].message };
    }
  } else {
    if (!trimmed) return { success: false, error: "Please enter a phone number." };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("subscribers")
      .insert({ value: trimmed, mode });

    if (error) {
      // Unique constraint — already subscribed, treat as success
      if (error.code === "23505") return { success: true };
      throw error;
    }
    return { success: true };
  } catch {
    return { success: false, error: "Subscription failed. Please try again." };
  }
}
