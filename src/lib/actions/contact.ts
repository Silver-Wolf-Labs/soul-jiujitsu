"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { contactSchema } from "@/lib/validations/contact";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult as ContactResult };

export async function submitContact(formData: FormData): Promise<ActionResult> {
  const raw = {
    first_name: (formData.get("first_name") as string)?.trim() ?? "",
    last_name:  (formData.get("last_name")  as string)?.trim() ?? "",
    email:      (formData.get("email")      as string)?.trim().toLowerCase() ?? "",
    message:    (formData.get("message")    as string)?.trim() ?? "",
    website:    (formData.get("website")    as string) ?? "",
  };

  // Honeypot filled — log and silently succeed to not tip off bots
  if (raw.website) {
    console.warn("[contact] honeypot triggered", { email: raw.email });
    return { success: true };
  }

  const result = contactSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from("contact_submissions").insert({
      first_name: result.data.first_name,
      last_name:  result.data.last_name,
      email:      result.data.email,
      message:    result.data.message,
    });

    if (error) throw error;

    revalidatePath("/admin/contacts");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to send message. Please try again." };
  }
}
