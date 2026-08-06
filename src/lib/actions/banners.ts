"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { bannerSchema } from "@/lib/validations/banner";
import { logAuditEvent } from "@/lib/audit";

type BannerPayload = {
  text: string; color: string; display_order: number; active: boolean;
  starts_at: string | null; expires_at: string | null; section: string; expanded?: boolean;
};

export async function createBanner(data: BannerPayload) {
  await requireAdmin();
  const parsed = bannerSchema.parse(data);
  const supabase = createClient();
  const { error, data: row } = await supabase.from("banners").insert(parsed).select("id").single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "banners", row?.id, { ...parsed });
  revalidatePath("/");
}

export async function updateBanner(id: number, data: BannerPayload) {
  await requireAdmin();
  const parsed = bannerSchema.parse(data);
  const supabase = createClient();
  const { data: before } = await supabase.from("banners").select("*").eq("id", id).single();
  const { error } = await supabase.from("banners").update(parsed).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "banners", id, { before, after: parsed });
  revalidatePath("/");
}

export async function deleteBanner(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("banners").select("*").eq("id", id).single();
  const { error } = await supabase.from("banners").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "banners", id, { deleted: before });
  revalidatePath("/");
}

export async function toggleBannerActive(id: number, active: boolean) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("banners").update({ active }).eq("id", id);
  await logAuditEvent("TOGGLE", "banners", id, { field: "active", from: !active, to: active });
  revalidatePath("/");
}

export async function reorderBanner(id: number, direction: "up" | "down", currentOrder: number, section: string) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase.from("banners").select("id").eq("display_order", targetOrder).eq("section", section).maybeSingle();
  if (sibling) {
    await supabase.from("banners").update({ display_order: currentOrder }).eq("id", sibling.id);
  }
  await supabase.from("banners").update({ display_order: targetOrder }).eq("id", id);
  revalidatePath("/");
}
