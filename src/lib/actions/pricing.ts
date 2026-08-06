"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

type PricingPlanPayload = {
  tier: string; price: string; period: string; features: string[];
  cta: string; cta_href: string; featured: boolean;
  highlight_color: string | null; highlight_label: string | null;
  display_order: number; active: boolean; expires_at: string | null;
};

export async function createPricingPlan(data: PricingPlanPayload) {
  await requireAdmin();
  const supabase = createClient();
  const { error, data: row } = await supabase.from("pricing_plans").insert(data).select("id").single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "pricing_plans", row?.id, { ...data });
  revalidatePath("/");
}

export async function updatePricingPlan(id: number, data: PricingPlanPayload) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("pricing_plans").select("*").eq("id", id).single();
  const { error } = await supabase.from("pricing_plans").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "pricing_plans", id, { before, after: data });
  revalidatePath("/");
}

export async function deletePricingPlan(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("pricing_plans").select("*").eq("id", id).single();
  const { error } = await supabase.from("pricing_plans").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "pricing_plans", id, { deleted: before });
  revalidatePath("/");
}

export async function togglePricingPlanActive(id: number, active: boolean) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("pricing_plans").update({ active }).eq("id", id);
  await logAuditEvent("TOGGLE", "pricing_plans", id, { field: "active", from: !active, to: active });
  revalidatePath("/");
}

export async function reorderPricingPlan(id: number, direction: "up" | "down", currentOrder: number) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase.from("pricing_plans").select("id").eq("display_order", targetOrder).maybeSingle();
  if (sibling) {
    await supabase.from("pricing_plans").update({ display_order: currentOrder }).eq("id", sibling.id);
  }
  await supabase.from("pricing_plans").update({ display_order: targetOrder }).eq("id", id);
  revalidatePath("/");
}
