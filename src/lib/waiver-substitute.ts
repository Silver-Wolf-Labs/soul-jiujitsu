import type { GymProfile } from "@/lib/gym-profile";

/**
 * Waiver templates are stored with literal placeholder tokens so the same
 * template can be reused across different gym deployments:
 *   [GYM NAME]     → the gym's legal name
 *   [GYM ADDRESS]  → the gym's street address (street, city, state zip)
 *   [GYM EMAIL]    → the gym's contact email
 *
 * This is a pure string function — no React, no Supabase imports — so it
 * can run in both server components and client components. Callers must
 * supply the GymProfile they already have in hand (server: getGymProfile,
 * client: useGymProfile).
 */
export function substituteWaiverPlaceholders(md: string, profile: GymProfile): string {
  if (!md) return md;
  const fullAddress = [
    profile.contact.address,
    profile.contact.city,
    profile.contact.state,
    profile.contact.zip,
  ]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");

  return md
    .replace(/\[GYM NAME\]/g, profile.gymName)
    .replace(/\[GYM ADDRESS\]/g, fullAddress || "[GYM ADDRESS]")
    .replace(/\[GYM EMAIL\]/g, profile.contact.email);
}
