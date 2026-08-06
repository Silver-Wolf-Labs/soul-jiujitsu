"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

interface HourRow { days: string; hours: string; }

interface LocationPayload {
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  hours: HourRow[];
  mapEmbed: string;
}

const LOCATION_KEYS = [
  "contact_address", "contact_city", "contact_state", "contact_zip",
  "contact_phone", "contact_email", "contact_hours", "contact_map_embed",
];

export async function saveLocationSettings(payload: LocationPayload) {
  await requireAdmin();
  const supabase = createClient();

  // Capture old values
  const { data: rows } = await supabase
    .from("site_settings")
    .select("key,value")
    .in("key", LOCATION_KEYS);
  const before = Object.fromEntries((rows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));

  const entries: [string, string][] = [
    ["contact_address",   payload.address],
    ["contact_city",      payload.city],
    ["contact_state",     payload.state],
    ["contact_zip",       payload.zip],
    ["contact_phone",     payload.phone],
    ["contact_email",     payload.email],
    ["contact_hours",     JSON.stringify(payload.hours)],
    ["contact_map_embed", payload.mapEmbed],
  ];

  for (const [key, value] of entries) {
    await supabase.from("site_settings").upsert({ key, value }, { onConflict: "key" });
  }

  const after = Object.fromEntries(entries);
  await logAuditEvent("UPDATE", "site_settings", null, { before, after });
  revalidatePath("/");
}
