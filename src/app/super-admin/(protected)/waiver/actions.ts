"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";

export type WaiverSaveResult =
  | { success: true; title?: string; bodyMd?: string }
  | { success: false; error: string };

export async function saveWaiverTemplate(
  templateId: number,
  title: string,
  bodyMd: string
): Promise<WaiverSaveResult> {
  await requireSuperAdmin();

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("waiver_templates")
    .update({
      title,
      body_md: bodyMd,
    })
    .eq("id", templateId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/waiver");
  revalidatePath("/super-admin/waiver");

  return { success: true };
}

/**
 * Replace placeholders in the waiver with gym-specific values.
 * This is the same operation the bootstrap script does.
 */
export async function customizeWaiverFromProfile(): Promise<WaiverSaveResult> {
  await requireSuperAdmin();

  const supabase = createServiceClient();

  // Get current gym identity
  const keys = ["gym_name", "contact_address", "contact_city", "contact_state", "contact_zip", "contact_email"];
  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", keys);

  if (!settings || settings.length === 0) {
    return { success: false, error: "No gym identity configured. Set up gym details first." };
  }

  const map = new Map(settings.map((s) => [s.key, s.value || ""]));
  const gymName = map.get("gym_name") || "[GYM NAME]";
  const address = map.get("contact_address") || "";
  const city = map.get("contact_city") || "";
  const state = map.get("contact_state") || "";
  const zip = map.get("contact_zip") || "";
  const email = map.get("contact_email") || "[GYM EMAIL]";
  const fullAddress = [address, city, state, zip].filter(Boolean).join(", ") || "[GYM ADDRESS]";

  // Get active waiver
  const { data: waiver } = await supabase
    .from("waiver_templates")
    .select("id, title, body_md")
    .eq("active", true)
    .single();

  if (!waiver) {
    return { success: false, error: "No active waiver template found." };
  }

  // Check if waiver has placeholders
  if (!waiver.body_md.includes("[GYM NAME]") && !waiver.body_md.includes("[GYM ADDRESS]") && !waiver.body_md.includes("[GYM EMAIL]")) {
    return { success: false, error: "Waiver already customized — no placeholders remain." };
  }

  const customBody = waiver.body_md
    .replace(/\[GYM NAME\]/g, gymName)
    .replace(/\[GYM ADDRESS\]/g, fullAddress)
    .replace(/\[GYM EMAIL\]/g, email);

  const customTitle = `${gymName} — Membership & Liability Waiver`;

  const { error } = await supabase
    .from("waiver_templates")
    .update({ title: customTitle, body_md: customBody })
    .eq("id", waiver.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/waiver");
  revalidatePath("/super-admin/waiver");

  return { success: true, title: customTitle, bodyMd: customBody };
}
