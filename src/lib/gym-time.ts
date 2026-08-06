/**
 * Gym-timezone utilities shared by kiosk and portal server actions.
 *
 * Server actions run on Vercel (UTC). All "today" calculations must use
 * the gym's local time so both surfaces agree on date boundaries regardless
 * of the Vercel region's UTC offset.
 *
 * The timezone is cached in module scope after the first DB read — it survives
 * within a single Node.js warm execution so hot-path requests skip the query.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { SETTINGS_KEYS } from "@/lib/settings-keys";

const DEFAULT_TZ = "America/Chicago";
let cachedTz = "";

/**
 * Returns the gym's IANA timezone string, e.g. "America/Chicago".
 * Reads `site_settings.gym_timezone` once and caches the result.
 */
export async function getGymTz(): Promise<string> {
  if (cachedTz !== "") return cachedTz;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", SETTINGS_KEYS.GYM_TIMEZONE)
      .single();
    cachedTz = data?.value || DEFAULT_TZ;
  } catch {
    cachedTz = DEFAULT_TZ;
  }
  return cachedTz;
}

/** "YYYY-MM-DD" in the gym's local timezone. */
export async function gymToday(): Promise<string> {
  const tz = await getGymTz();
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

/** PG day_of_week (1=Mon…7=Sun) in the gym's local timezone. */
export async function gymPgDay(): Promise<number> {
  const tz = await getGymTz();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  const local = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00`);
  const jsDay = local.getDay(); // 0=Sun
  return jsDay === 0 ? 7 : jsDay;
}
