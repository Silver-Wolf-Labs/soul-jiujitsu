/**
 * Pure types + defaults for the kiosk UI runtime config.
 *
 * This module is intentionally free of server-only imports (no `next/headers`,
 * no Supabase clients) so it can be pulled into client components through the
 * context provider without dragging server code into the client bundle.
 *
 * The loader that actually reads `site_settings` lives in
 * `kiosk-ui-config.server.ts` — keep these two in sync.
 */

/**
 * How long the kiosk stays open after a successful unlock.
 *   "strict" — re-PIN on every refresh (original behavior).
 *   "4h"/"8h"/"16h" — the kiosk_grace_until cookie absorbs refreshes until
 *     the window ends, at which point the guard redirects to the PIN pad.
 */
export type KioskUnlockGrace = "strict" | "4h" | "8h" | "16h";

/** Milliseconds per non-strict grace window. */
export const UNLOCK_GRACE_MS: Record<Exclude<KioskUnlockGrace, "strict">, number> = {
  "4h":  4 * 60 * 60 * 1000,
  "8h":  8 * 60 * 60 * 1000,
  "16h": 16 * 60 * 60 * 1000,
};

/** All valid values — handy for admin UI iteration and loader sanitization. */
export const UNLOCK_GRACE_VALUES: readonly KioskUnlockGrace[] = [
  "strict",
  "4h",
  "8h",
  "16h",
] as const;

export interface KioskUiConfig {
  /**
   * When true, typed PIN digits mask to a filled circle after `PIN_MASK_DELAY_MS`.
   * Only the newest digit briefly reveals, previous digits stay masked.
   * Default: true (secure by default).
   */
  pinPrivacyMask: boolean;
  /**
   * Unlock persistence policy — see `KioskUnlockGrace`.
   * Default: "strict" (safest; explicit opt-in to convenience).
   */
  unlockGrace: KioskUnlockGrace;
}

export const DEFAULT_KIOSK_UI_CONFIG: KioskUiConfig = {
  pinPrivacyMask: true,
  unlockGrace: "4h",
};

/**
 * How long (ms) a freshly typed digit stays visible before masking to the glyph.
 * Shared between the loader and the PinPad component.
 */
export const PIN_MASK_DELAY_MS = 500;

/** Narrow an arbitrary string to a valid `KioskUnlockGrace`, else the default. */
export function parseUnlockGrace(raw: string | null | undefined): KioskUnlockGrace {
  const v = (raw ?? "").trim().toLowerCase();
  return (UNLOCK_GRACE_VALUES as readonly string[]).includes(v)
    ? (v as KioskUnlockGrace)
    : DEFAULT_KIOSK_UI_CONFIG.unlockGrace;
}
