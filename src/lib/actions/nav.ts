"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

// ── Nav Items ──────────────────────────────────────────────────────────────

export async function createNavItem(data: { label: string; href: string; display_order: number }) {
  await requireAdmin();
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("nav_items")
    .insert(data)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "nav_items", String(row.id), { ...data });
}

export async function updateNavItem(id: number, data: { label: string; href: string; display_order: number }) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("nav_items").select("*").eq("id", id).single();
  const { error } = await supabase.from("nav_items").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "nav_items", String(id), { before, after: data });
}

export async function deleteNavItem(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("nav_items").select("*").eq("id", id).single();
  const { error } = await supabase.from("nav_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "nav_items", String(id), { deleted: before });
}

export async function toggleNavItemActive(id: number, active: boolean) {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase.from("nav_items").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "nav_items", String(id), { field: "active", from: !active, to: active });
}

export async function reorderNavItem(id: number, direction: "up" | "down", currentOrder: number) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase
    .from("nav_items")
    .select("id")
    .eq("display_order", targetOrder)
    .single();
  if (sibling) {
    await supabase.from("nav_items").update({ display_order: currentOrder }).eq("id", sibling.id);
  }
  await supabase.from("nav_items").update({ display_order: targetOrder }).eq("id", id);
}

// ── Footer Items ───────────────────────────────────────────────────────────

export async function createFooterItem(data: { label: string; href: string; group_name: string; display_order: number }) {
  await requireAdmin();
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("footer_items")
    .insert(data)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "footer_items", String(row.id), { ...data });
}

export async function updateFooterItem(id: number, data: { label: string; href: string; group_name: string; display_order: number }) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("footer_items").select("*").eq("id", id).single();
  const { error } = await supabase.from("footer_items").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "footer_items", String(id), { before, after: data });
}

export async function deleteFooterItem(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("footer_items").select("*").eq("id", id).single();
  const { error } = await supabase.from("footer_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "footer_items", String(id), { deleted: before });
}

export async function toggleFooterItemActive(id: number, active: boolean) {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase.from("footer_items").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "footer_items", String(id), { field: "active", from: !active, to: active });
}

export async function reorderFooterItem(id: number, direction: "up" | "down", currentOrder: number) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase
    .from("footer_items")
    .select("id")
    .eq("display_order", targetOrder)
    .single();
  if (sibling) {
    await supabase.from("footer_items").update({ display_order: currentOrder }).eq("id", sibling.id);
  }
  await supabase.from("footer_items").update({ display_order: targetOrder }).eq("id", id);
}
