// This module imports the service-role Supabase client, which depends on the
// `SUPABASE_SERVICE_ROLE_KEY` env var (never exposed to the browser). That
// alone keeps it out of the client bundle in practice — we rely on the
// `.server.ts` naming convention + context-provider pattern for readability.

import { createServiceClient } from "@/lib/supabase/service";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import {
  DEFAULT_KIOSK_UI_CONFIG,
  parseUnlockGrace,
  type KioskUiConfig,
} from "@/lib/kiosk-ui-config";

/**
 * Load the kiosk UI config from `site_settings`.
 *
 * Parsing is secure-by-default: any key that is absent, empty, or holds an
 * unexpected value falls back to the default. For `pin_privacy_mask` that
 * means ONLY a literal "false" disables masking — anything else keeps the
 * privacy-preserving behavior. `unlock_grace` is similarly narrowed to the
 * known enum via `parseUnlockGrace`.
 *
 * Uses the service-role client because this runs in unauthenticated kiosk
 * requests (the kiosk device has no Supabase session; RLS would block reads).
 */
export async function getKioskUiConfig(): Promise<KioskUiConfig> {
  const service = createServiceClient();
  const { data } = await service
    .from("site_settings")
    .select("key,value")
    .in("key", [
      SETTINGS_KEYS.KIOSK_PIN_PRIVACY_MASK,
      SETTINGS_KEYS.KIOSK_UNLOCK_GRACE,
    ]);

  const rows = (data ?? []) as { key: string; value: string }[];
  const get = (k: string) => rows.find(r => r.key === k)?.value ?? "";

  const rawMask = get(SETTINGS_KEYS.KIOSK_PIN_PRIVACY_MASK).trim().toLowerCase();
  const pinPrivacyMask = rawMask === "false"
    ? false
    : DEFAULT_KIOSK_UI_CONFIG.pinPrivacyMask;

  const unlockGrace = parseUnlockGrace(get(SETTINGS_KEYS.KIOSK_UNLOCK_GRACE));

  return { pinPrivacyMask, unlockGrace };
}
