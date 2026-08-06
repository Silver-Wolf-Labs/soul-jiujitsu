"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { type GymSetupKey } from "@/lib/settings-keys";

export type GymSetupData = Record<GymSetupKey, string>;

export type SaveResult = { success: true; count: number } | { success: false; error: string };

export async function saveGymSetup(data: GymSetupData): Promise<SaveResult> {
  await requireSuperAdmin();

  const supabase = createServiceClient();
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);

  const rows = entries.map(([key, value]) => ({ key, value: value || "" }));
  const { error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    return { success: false, error: error.message };
  }

  // Revalidate all paths that depend on gym profile
  revalidatePath("/", "layout");
  revalidatePath("/super-admin");

  return { success: true, count: rows.length };
}
