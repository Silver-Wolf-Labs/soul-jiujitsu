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
    wazeUrl: string;
  };
}

// ── Defaults (Soul Jiu-Jitsu — used when DB has no override) ──────────────
//
// These are the real values, matching the `gym_*` / `contact_*` rows in
// site_settings. They are the fallback for two cases: the DB being unreachable
// (the `catch` in getGymProfile) and a key being absent or empty. Keeping them
// real rather than TODO_* means an outage degrades to correct contact details
// instead of rendering "TODO_EMAIL" as a mailto: link to visitors.
//
// To change them for a deployment, prefer site_settings (via the admin UI or
// `npx tsx scripts/bootstrap-gym.ts`) — no code change needed. See SETUP.md.

export const DEFAULT_GYM_PROFILE: GymProfile = {
  gymName: "Soul Jiu Jitsu",
  shortName: "Soul JJ",
  logoText: "SOUL",
  logoDot: "\u2022",
  cityName: "San Diego",
  tagline: "Jiu jitsu para el alma. Formamos personas fuertes dentro y fuera del tatami.",
  timezone: "America/Costa_Rica",
  affiliateText:
    "Jiu jitsu integral en San Diego de Cartago. Un espacio 100% seguro, inclusivo y respetuoso. Afiliados a Sektor Jiu-Jitsu.",
  footerTags: ["Gi", "No-Gi", "Kids", "Open Mat"],
  joinButtonText: "Únete a Soul",
  meta: {
    title: "Soul Jiu Jitsu | Jiu Jitsu en San Diego, Cartago, Costa Rica",
    description:
      "Entrena jiu jitsu en Soul Jiu Jitsu, San Diego de Cartago. Clases de Gi, No-Gi, kids y open mats en un espacio seguro, inclusivo y respetuoso.",
    url: "http://localhost:3000",
  },
  social: {
    instagram: "",
    instagramHandle: "",
  },
  contact: {
    address: "Cola de Gallo Comida Mexicana & Mixology Cocktails",
    city: "San Diego",
    state: "Cartago",
    zip: "",
    // Sin teléfono público por ahora — los componentes ocultan la fila
    // cuando está vacío. Se configura vía site_settings (contact_phone).
    phone: "",
    phoneHref: "",
    email: "admin@silverwolflabs.com",
    wazeUrl: "https://waze.com/ul/hd1u227fcp",
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
  contact_waze_url:      (p, v) => { p.contact.wazeUrl = v; },
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
