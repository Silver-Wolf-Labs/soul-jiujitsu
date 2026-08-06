/**
 * Pure types + defaults for the admin hard-session-lifetime setting.
 *
 * The admin panel has two independent timers:
 *   1. An idle timeout (30 min, hard-coded in AdminSessionGuard) that
 *      triggers the "Stay logged in?" modal.
 *   2. A hard session lifetime — the "you must re-auth after X" ceiling.
 *      This module is about #2.
 *
 * Storing the policy in `site_settings` keeps it admin-configurable without
 * a redeploy, and the parse helper below narrows any DB value back to the
 * known enum so an invalid override can never leave an admin session
 * unbounded.
 */

export type AdminSessionTtl = "15m" | "1h" | "4h" | "8h" | "16h";

/** Milliseconds per TTL value. Used by AdminSessionGuard as `hardExpiresAt`. */
export const ADMIN_SESSION_TTL_MS: Record<AdminSessionTtl, number> = {
  "15m": 15 * 60 * 1000,
  "1h":  60 * 60 * 1000,
  "4h":  4 * 60 * 60 * 1000,
  "8h":  8 * 60 * 60 * 1000,
  "16h": 16 * 60 * 60 * 1000,
};

/** Ordered list for the admin UI's radio group. */
export const ADMIN_SESSION_TTL_VALUES: readonly AdminSessionTtl[] = [
  "15m",
  "1h",
  "4h",
  "8h",
  "16h",
] as const;

/**
 * Default matches Supabase's access-token lifetime (1h) so a refresh cycle
 * naturally aligns with the hard-session ceiling on a fresh install.
 */
export const DEFAULT_ADMIN_SESSION_TTL: AdminSessionTtl = "1h";

/** Narrow an arbitrary string to a valid `AdminSessionTtl`, else the default. */
export function parseAdminSessionTtl(raw: string | null | undefined): AdminSessionTtl {
  const v = (raw ?? "").trim().toLowerCase();
  return (ADMIN_SESSION_TTL_VALUES as readonly string[]).includes(v)
    ? (v as AdminSessionTtl)
    : DEFAULT_ADMIN_SESSION_TTL;
}
