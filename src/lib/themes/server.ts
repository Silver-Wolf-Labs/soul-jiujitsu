import { createClient } from "@/lib/supabase/server";
import { THEMES, DEFAULT_THEME_ID } from "./registry";
import { slotsToCustomProperties } from "./css";
import { generateSlots } from "./generate";
import type { ThemeRoleColors } from "./roles";

/** Called from the root layout — returns a :root { ... } CSS string for the active theme */
export async function getActiveThemeCssVars(): Promise<string> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["active_theme", "custom_theme_roles", "custom_theme_tone"]);

    const settings = Object.fromEntries(
      (data ?? []).map((r) => [r.key, r.value]),
    );
    const themeId = settings.active_theme ?? DEFAULT_THEME_ID;

    if (themeId === "custom" && settings.custom_theme_roles) {
      try {
        const roles: ThemeRoleColors = JSON.parse(settings.custom_theme_roles);
        const tone = (settings.custom_theme_tone ?? "warm") as
          | "warm"
          | "cool"
          | "neutral";
        const slots = generateSlots(roles, tone);
        return slotsToCustomProperties(slots);
      } catch {
        // Invalid custom config — fall through to default
      }
    }

    const theme = THEMES.get(themeId) ?? THEMES.get(DEFAULT_THEME_ID)!;
    return slotsToCustomProperties(theme.slots);
  } catch {
    const theme = THEMES.get(DEFAULT_THEME_ID)!;
    return slotsToCustomProperties(theme.slots);
  }
}
