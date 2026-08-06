import { createServiceClient } from "@/lib/supabase/service";
import { GYM_SETUP_KEYS } from "@/lib/settings-keys";
import SetupForm from "./SetupForm";
import type { GymSetupData } from "./actions";

export default async function SetupPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", GYM_SETUP_KEYS as unknown as string[]);

  // Build initial values from DB
  const initial: GymSetupData = {
    gym_name: "", gym_short_name: "", gym_logo_text: "", gym_logo_dot: "\u2022",
    gym_city_name: "", gym_tagline: "Train. Improve. Belong.", gym_timezone: "America/Chicago",
    gym_affiliate_text: "", gym_footer_tags: "", gym_join_button_text: "",
    gym_meta_title: "", gym_meta_description: "", gym_meta_url: "",
    gym_instagram_url: "", gym_instagram_handle: "",
    contact_address: "", contact_city: "", contact_state: "", contact_zip: "",
    contact_phone: "", contact_email: "",
  };

  if (data) {
    for (const row of data) {
      if (row.key in initial) {
        (initial as unknown as Record<string, string>)[row.key] = row.value || "";
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display text-white tracking-wider">GYM SETUP</h1>
        <p className="text-sm text-white/40 mt-1">
          Configure all gym identity, contact, and SEO settings.
          Changes take effect immediately across the site.
        </p>
      </div>
      <SetupForm initial={initial} />
    </div>
  );
}
