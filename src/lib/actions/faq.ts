"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

type FAQPayload = {
  question: string; answer: string; display_order: number;
  active: boolean; expires_at: string | null;
};

export async function createFAQItem(data: FAQPayload) {
  await requireAdmin();
  const supabase = createClient();
  const { error, data: row } = await supabase.from("faq_items").insert(data).select("id").single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "faq_items", row?.id, { ...data });
  revalidatePath("/");
}

export async function updateFAQItem(id: number, data: FAQPayload) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("faq_items").select("*").eq("id", id).single();
  const { error } = await supabase.from("faq_items").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "faq_items", id, { before, after: data });
  revalidatePath("/");
}

export async function deleteFAQItem(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("faq_items").select("*").eq("id", id).single();
  const { error } = await supabase.from("faq_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "faq_items", id, { deleted: before });
  revalidatePath("/");
}

export async function toggleFAQItemActive(id: number, active: boolean) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("faq_items").update({ active }).eq("id", id);
  await logAuditEvent("TOGGLE", "faq_items", id, { field: "active", from: !active, to: active });
  revalidatePath("/");
}

export async function reorderFAQItem(id: number, direction: "up" | "down", currentOrder: number) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase.from("faq_items").select("id").eq("display_order", targetOrder).maybeSingle();
  if (sibling) {
    await supabase.from("faq_items").update({ display_order: currentOrder }).eq("id", sibling.id);
  }
  await supabase.from("faq_items").update({ display_order: targetOrder }).eq("id", id);
  revalidatePath("/");
}
