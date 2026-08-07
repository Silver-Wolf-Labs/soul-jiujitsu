"use server";

import { createClient } from "@/lib/supabase/server";
import { subscribeSchema } from "@/lib/validations/subscribe";
import { checkEmailDeliverability } from "@/lib/actions/email-deliverability";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Extends `ActionResult` with a typo suggestion. The subscribe form is a single
 * input with no second step, so a "did you mean gmail.com?" prompt is the only
 * chance to catch a misspelled domain before it is stored — and a stored typo is
 * a bounce waiting for the first newsletter send.
 */
export interface SubscribeResult extends ActionResult {
  /** Corrected address to offer the subscriber; null when nothing looks off. */
  suggestion?: string | null;
}

export async function addSubscriber(
  value: string,
  mode: "email" | "sms",
  honeypot?: string,
  /**
   * Set once the subscriber has answered the suggestion prompt — either by
   * accepting the correction or by insisting on what they typed. Without it a
   * confirmed-but-unusual domain could never get past the prompt.
   */
  suggestionResolved?: boolean
): Promise<SubscribeResult> {
  // Honeypot filled — log and silently succeed to not tip off bots
  if (honeypot) {
    console.warn("[subscribe] honeypot triggered", { value, mode });
    return { success: true };
  }

  let trimmed = value.trim().toLowerCase();

  if (mode === "email") {
    const result = subscribeSchema.safeParse({ email: trimmed });
    if (!result.success) {
      return { success: false, error: result.error.issues[0].message };
    }

    // Nothing mails this list yet, but it exists to be mailed — so an
    // undeliverable address stored here is a bounce deferred, not avoided.
    // Rejecting at intake is the whole point of "verify email addresses in
    // your application workflows": once the list is large, there is no way to
    // tell a typo from a member who simply never opens mail.
    const gate = await checkEmailDeliverability(trimmed);
    if (!gate.ok) {
      return { success: false, error: gate.message };
    }

    // A near-miss on a common provider is surfaced for confirmation rather than
    // stored or auto-corrected: the domain might be genuinely unusual, and
    // rewriting it would subscribe a stranger's address.
    if (gate.suggestion && !suggestionResolved) {
      return { success: false, suggestion: gate.suggestion };
    }

    trimmed = gate.email;
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
