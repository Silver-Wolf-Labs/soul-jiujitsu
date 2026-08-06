/**
 * Environment variable validation.
 * Imported by the root layout — fails fast on missing required vars.
 *
 * To add a new required variable, add it to the appropriate array below.
 */

const REQUIRED_SERVER = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** Vars that are optional but trigger a warning when missing */
const OPTIONAL_WARN = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

const REQUIRED_PUBLIC = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const OPTIONAL_WITH_DEFAULTS: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  CRON_SECRET: "",
};

/** Minimum length for SUPER_ADMIN_PASSWORD when set */
const SUPER_ADMIN_MIN_LENGTH = 16;

let validated = false;

/**
 * Validate that all required env vars are present.
 * Call once from the root layout (server-side).
 * Throws on the first missing variable — logs all missing for easier debugging.
 */
export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const missing: string[] = [];

  for (const key of REQUIRED_SERVER) {
    if (!process.env[key]) missing.push(key);
  }

  for (const key of REQUIRED_PUBLIC) {
    if (!process.env[key]) missing.push(key);
  }

  // Deduplicate (public vars appear in both lists)
  const unique = missing.filter((v, i, a) => a.indexOf(v) === i);

  // During `next build` (NEXT_PHASE=phase-production-build), only warn.
  // At actual runtime, throw so the app fails fast.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";

  if (unique.length > 0) {
    const msg = [
      "",
      "=".repeat(60),
      " MISSING REQUIRED ENVIRONMENT VARIABLES",
      "=".repeat(60),
      "",
      ...unique.map(k => `  - ${k}`),
      "",
      " Copy .env.local.example to .env.local and fill in the values.",
      "=".repeat(60),
      "",
    ].join("\n");

    if (isBuild) {
      console.warn(msg);
    } else if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variables: ${unique.join(", ")}`);
    } else {
      console.error(msg);
    }
  }

  // Warn about missing optional vars (Stripe, etc.)
  const missingOptional = OPTIONAL_WARN.filter((k) => !process.env[k]);
  if (missingOptional.length > 0) {
    console.warn(
      `\n  ⚠ Optional env vars not set (features disabled): ${missingOptional.join(", ")}\n`
    );
  }

  // Enforce SUPER_ADMIN_PASSWORD minimum length
  const saPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (saPassword && saPassword.length < SUPER_ADMIN_MIN_LENGTH) {
    const pwMsg = `SUPER_ADMIN_PASSWORD is only ${saPassword.length} chars — minimum ${SUPER_ADMIN_MIN_LENGTH} required.`;
    if (isBuild) {
      console.warn(`\n  ⚠ ${pwMsg}\n`);
    } else if (process.env.NODE_ENV === "production") {
      throw new Error(pwMsg);
    } else {
      console.error(`\n  ⚠ ${pwMsg}\n`);
    }
  }

  // Set defaults for optional vars
  for (const [key, defaultValue] of Object.entries(OPTIONAL_WITH_DEFAULTS)) {
    if (!process.env[key] && defaultValue) {
      process.env[key] = defaultValue;
    }
  }
}
