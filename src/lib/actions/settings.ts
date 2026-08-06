"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

export async function updateAlertSettings(enabled: boolean, text: string) {
  await requireAdmin();
  const supabase = createClient();

  // Capture old values for before/after diff
  const { data: rows } = await supabase
    .from("site_settings")
    .select("key,value")
    .in("key", ["alert_enabled", "alert_text"]);
  const before = Object.fromEntries((rows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));

  await supabase.from("site_settings").upsert([
    { key: "alert_enabled", value: String(enabled) },
    { key: "alert_text", value: text },
  ]);
  await logAuditEvent("UPDATE", "site_settings", null, {
    before: { alert_enabled: before.alert_enabled, alert_text: before.alert_text },
    after: { alert_enabled: String(enabled), alert_text: text },
  });
  revalidatePath("/");
}

export async function getSiteSettings(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.from("site_settings").select("key,value");
  return Object.fromEntries((data ?? []).map((s: { key: string; value: string }) => [s.key, s.value]));
}
