"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

type UpdatePayload = {
  type: string; title: string; body: string; date: string;
  published: boolean; expires_at: string | null; display_order: number;
};

export async function createUpdate(data: UpdatePayload) {
  await requireAdmin();
  const supabase = createClient();
  const { error, data: row } = await supabase.from("updates").insert(data).select("id").single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "updates", row?.id, { ...data });
  revalidatePath("/");
}

export async function updateUpdate(id: number, data: UpdatePayload) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("updates").select("*").eq("id", id).single();
  const { error } = await supabase.from("updates").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "updates", id, { before, after: data });
  revalidatePath("/");
}

export async function deleteUpdate(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("updates").select("*").eq("id", id).single();
  const { error } = await supabase.from("updates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "updates", id, { deleted: before });
  revalidatePath("/");
}

export async function toggleUpdatePublished(id: number, published: boolean) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("updates").update({ published }).eq("id", id);
  await logAuditEvent("TOGGLE", "updates", id, { field: "published", from: !published, to: published });
  revalidatePath("/");
}

export async function reorderUpdate(id: number, direction: "up" | "down", currentOrder: number) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase.from("updates").select("id").eq("display_order", targetOrder).maybeSingle();
  if (sibling) {
    await supabase.from("updates").update({ display_order: currentOrder }).eq("id", sibling.id);
  }
  await supabase.from("updates").update({ display_order: targetOrder }).eq("id", id);
  revalidatePath("/");
}
