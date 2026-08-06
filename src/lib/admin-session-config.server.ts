// Server-only loader for the admin hard-session TTL. Same rationale as
// kiosk-ui-config.server.ts — the naming convention + service-role import
// keeps this out of the client bundle.

import { createServiceClient } from "@/lib/supabase/service";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import {
  ADMIN_SESSION_TTL_MS,
  DEFAULT_ADMIN_SESSION_TTL,
  parseAdminSessionTtl,
  type AdminSessionTtl,
} from "@/lib/admin-session-config";

/**
 * Read the admin hard-session TTL from `site_settings`.
 * Returns both the enum value (for round-tripping into UI) and its ms form
 * (for AdminSessionGuard's `hardExpiresAt` calculation).
 */
export async function getAdminSessionTtl(): Promise<{
  value: AdminSessionTtl;
  ms: number;
}> {
  const service = createServiceClient();
  const { data } = await service
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.ADMIN_SESSION_TTL)
    .maybeSingle();

  const value = parseAdminSessionTtl(data?.value);
  return { value, ms: ADMIN_SESSION_TTL_MS[value] };
}

/** Handy default for callers that want to skip the DB hit on login paths. */
export const DEFAULT_ADMIN_SESSION_TTL_MS = ADMIN_SESSION_TTL_MS[DEFAULT_ADMIN_SESSION_TTL];
