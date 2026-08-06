import { createClient } from "@/lib/supabase/server";

// ── Type ────────────────────────────────────────────────────────────────────

export interface GymProfile {
  gymName: string;
  shortName: string;
  logoText: string;
  logoDot: string;
  cityName: string;
  tagline: string;
  timezone: string;
  affiliateText: string;
  footerTags: string[];
  joinButtonText: string;
  meta: { title: string; description: string; url: string };
  social: { instagram: string; instagramHandle: string };
  contact: {
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    phoneHref: string;
    email: string;
  };
}

// ── Defaults (Soul Jiu-Jitsu — used when DB has no override) ──────────────
//
// TODO(setup): values marked TODO_* are placeholders. Replace them before any
// public deploy — either run `npx tsx scripts/bootstrap-gym.ts` (writes to
// site_settings, no code change needed) or edit this block. See SETUP.md.

export const DEFAULT_GYM_PROFILE: GymProfile = {
  gymName: "Soul Jiu-Jitsu",
  shortName: "Soul JJ",
  logoText: "SOUL",
  logoDot: "\u2022",
  cityName: "TODO_CITY",
  tagline: "Train. Improve. Belong.",
  timezone: "America/Chicago",
  affiliateText: "Soul Jiu-Jitsu. Training athletes of all levels.",
  footerTags: ["BJJ", "No-Gi", "Youth"],
  joinButtonText: "Join Soul JJ",
  meta: {
    title: "Soul Jiu-Jitsu | Brazilian Jiu-Jitsu",
    description:
      "Train Brazilian Jiu-Jitsu at Soul Jiu-Jitsu. Gi, No-Gi, and Youth classes for all levels.",
    url: "http://localhost:3000",
  },
  social: {
    instagram: "",
    instagramHandle: "",
  },
  contact: {
    address: "TODO_ADDRESS",
    city: "TODO_CITY",
    state: "TODO_STATE",
    zip: "TODO_ZIP",
    phone: "TODO_PHONE",
    phoneHref: "tel:0000000000",
    email: "TODO_EMAIL",
  },
};

// ── Key → profile field mapping ─────────────────────────────────────────────

const KEY_MAP: Record<string, (p: GymProfile, v: string) => void> = {
  gym_name:              (p, v) => { p.gymName = v; },
  gym_short_name:        (p, v) => { p.shortName = v; },
  gym_logo_text:         (p, v) => { p.logoText = v; },
  gym_logo_dot:          (p, v) => { p.logoDot = v; },
  gym_city_name:         (p, v) => { p.cityName = v; },
  gym_tagline:           (p, v) => { p.tagline = v; },
  gym_timezone:          (p, v) => { p.timezone = v; },
  gym_affiliate_text:    (p, v) => { p.affiliateText = v; },
  gym_footer_tags:       (p, v) => { p.footerTags = v.split(",").map(s => s.trim()).filter(Boolean); },
  gym_join_button_text:  (p, v) => { p.joinButtonText = v; },
  gym_meta_title:        (p, v) => { p.meta.title = v; },
  gym_meta_description:  (p, v) => { p.meta.description = v; },
  gym_meta_url:          (p, v) => { p.meta.url = v; },
  gym_instagram_url:     (p, v) => { p.social.instagram = v; },
  gym_instagram_handle:  (p, v) => { p.social.instagramHandle = v; },
  contact_address:       (p, v) => { p.contact.address = v; },
  contact_city:          (p, v) => { p.contact.city = v; },
  contact_state:         (p, v) => { p.contact.state = v; },
  contact_zip:           (p, v) => { p.contact.zip = v; },
  contact_phone:         (p, v) => { p.contact.phone = v; p.contact.phoneHref = `tel:${v.replace(/\D/g, "")}`; },
  contact_email:         (p, v) => { p.contact.email = v; },
};

// ── Loader (server-side only) ───────────────────────────────────────────────

/**
 * Fetch the gym profile from site_settings, merged over defaults.
 * Safe to call from any server component or server action.
 */
export async function getGymProfile(): Promise<GymProfile> {
  // Deep-clone defaults so mutations don't leak between requests
  const profile: GymProfile = JSON.parse(JSON.stringify(DEFAULT_GYM_PROFILE));

  try {
    const supabase = createClient();
    const keys = Object.keys(KEY_MAP);
    const { data } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", keys);

    if (data) {
      for (const row of data) {
        const apply = KEY_MAP[row.key];
        if (apply && row.value) apply(profile, row.value);
      }
    }
  } catch {
    // DB unavailable — use defaults
  }

  return profile;
}
