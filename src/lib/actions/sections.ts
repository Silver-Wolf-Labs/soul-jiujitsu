"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

export async function updateSectionTitles(id: number, display_title: string, display_subtitle: string) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("site_sections").select("*").eq("id", id).single();
  await supabase.from("site_sections").update({
    display_title: display_title.trim() || null,
    display_subtitle: display_subtitle.trim() || null,
  }).eq("id", id);
  await logAuditEvent("UPDATE", "site_sections", id, {
    before: { display_title: before?.display_title, display_subtitle: before?.display_subtitle },
    after: { display_title: display_title.trim() || null, display_subtitle: display_subtitle.trim() || null },
  });
  revalidatePath("/");
}

export async function toggleSectionVisible(id: number, visible: boolean) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("site_sections").update({ visible }).eq("id", id);
  await logAuditEvent("TOGGLE", "site_sections", id, { field: "visible", from: !visible, to: visible });
  revalidatePath("/");
}

export async function reorderSection(id: number, direction: "up" | "down", currentOrder: number) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: neighbor } = await supabase
    .from("site_sections")
    .select("id")
    .eq("display_order", targetOrder)
    .single();
  if (neighbor) {
    await supabase.from("site_sections").update({ display_order: targetOrder }).eq("id", id);
    await supabase.from("site_sections").update({ display_order: currentOrder }).eq("id", (neighbor as { id: number }).id);
  }
  revalidatePath("/");
}
