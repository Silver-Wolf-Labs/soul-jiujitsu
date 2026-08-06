/**
 * Typed constants for all site_settings keys.
 * Use these instead of magic strings to avoid typos and ease refactoring.
 */
export const SETTINGS_KEYS = {
  // ── Gym identity ────────────────────────────────────────────────────────
  GYM_NAME:               "gym_name",
  GYM_SHORT_NAME:         "gym_short_name",
  GYM_LOGO_TEXT:          "gym_logo_text",
  GYM_LOGO_DOT:           "gym_logo_dot",
  GYM_CITY_NAME:          "gym_city_name",
  GYM_TAGLINE:            "gym_tagline",
  GYM_TIMEZONE:           "gym_timezone",
  GYM_AFFILIATE_TEXT:     "gym_affiliate_text",
  GYM_FOOTER_TAGS:        "gym_footer_tags",
  GYM_JOIN_BUTTON_TEXT:    "gym_join_button_text",

  // ── SEO / meta ──────────────────────────────────────────────────────────
  GYM_META_TITLE:         "gym_meta_title",
  GYM_META_DESCRIPTION:   "gym_meta_description",
  GYM_META_URL:           "gym_meta_url",

  // ── Social ──────────────────────────────────────────────────────────────
  GYM_INSTAGRAM_URL:      "gym_instagram_url",
  GYM_INSTAGRAM_HANDLE:   "gym_instagram_handle",

  // ── Contact (already used by location admin) ────────────────────────────
  CONTACT_ADDRESS:        "contact_address",
  CONTACT_CITY:           "contact_city",
  CONTACT_STATE:          "contact_state",
  CONTACT_ZIP:            "contact_zip",
  CONTACT_PHONE:          "contact_phone",
  CONTACT_EMAIL:          "contact_email",

  // ── Kiosk ───────────────────────────────────────────────────────────────
  KIOSK_PIN:              "kiosk_pin",
  KIOSK_SESSION_TOKEN:    "kiosk_session_token",
  KIOSK_ALLOWED_STATUSES: "kiosk_allowed_statuses",
  /** When "true", opening the kiosk requires an admin session in addition
   *  to the PIN. When "false" (or unset), just the PIN is enough. Defaults
   *  to "true" on fresh installs — see unlockKiosk() in check-ins.ts. */
  KIOSK_REQUIRE_ADMIN:    "kiosk_require_admin",
  /** When "true" (default), typed PIN digits mask to a filled circle after
   *  ~500ms so bystanders can't shoulder-surf. Applies to both the unlock
   *  pad at /kiosk and the member lookup pad at /kiosk/checkin. */
  KIOSK_PIN_PRIVACY_MASK: "kiosk_pin_privacy_mask",
  /** How long the kiosk stays open after a successful unlock without
   *  re-entering the PIN. One of "strict" | "4h" | "8h" | "16h".
   *  "strict" forces re-PIN on every refresh (today's behavior).
   *  The non-strict values set a `kiosk_grace_until` cookie that the
   *  checkin guard consults before demanding the PIN again.
   *  Default for new installs: "4h". */
  KIOSK_UNLOCK_GRACE:     "kiosk_unlock_grace",
  /** When "true" (default), `unlockKiosk()` signs the admin out of their
   *  Supabase session after issuing the kiosk_token cookie so staff can't
   *  navigate out of the kiosk to /admin on the same device. Can be
   *  toggled off for setup/testing workflows that want the admin session
   *  to survive the unlock. */
  KIOSK_LOGOUT_ADMIN_ON_UNLOCK: "kiosk_logout_admin_on_unlock",

  // ── Admin security ──────────────────────────────────────────────────────
  /** Hard cap on admin session lifetime before a forced re-auth.
   *  One of "15m" | "1h" | "4h" | "8h" | "16h". Default "1h".
   *  Orthogonal to idle-timeout, which stays at 30 minutes. */
  ADMIN_SESSION_TTL:      "admin_session_ttl",
} as const;

export type SettingsKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

/** Keys used by the super admin gym setup form */
export const GYM_SETUP_KEYS = [
  "gym_name", "gym_short_name", "gym_logo_text", "gym_logo_dot",
  "gym_city_name", "gym_tagline", "gym_timezone", "gym_affiliate_text",
  "gym_footer_tags", "gym_join_button_text",
  "gym_meta_title", "gym_meta_description", "gym_meta_url",
  "gym_instagram_url", "gym_instagram_handle",
  "contact_address", "contact_city", "contact_state", "contact_zip",
  "contact_phone", "contact_email",
] as const;

export type GymSetupKey = typeof GYM_SETUP_KEYS[number];
