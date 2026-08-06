"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

/**
 * Read a single value from site_settings by key.
 * Returns null when the key does not exist.
 */
export async function getSetting(key: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

export async function saveSetting(key: string, value: string) {
  await requireAdmin();
  const supabase = createClient();
  const { data: row } = await supabase.from("site_settings").select("value").eq("key", key).single();
  await supabase.from("site_settings").upsert({ key, value });
  await logAuditEvent("UPDATE", "site_settings", null, {
    before: { [key]: row?.value ?? null },
    after: { [key]: value },
  });
  revalidatePath("/");
}
