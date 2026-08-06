/**
 * Super Admin authentication utilities.
 *
 * Auth is password-based (env var), completely independent of Supabase auth.
 * Uses HMAC-SHA256 signed tokens stored in HttpOnly cookies.
 *
 * Security:
 *  - Password stored ONLY in SUPER_ADMIN_PASSWORD env var
 *  - Tokens are stateless: base64url(timestamp).base64url(hmac)
 *  - 1-hour expiry, SameSite=Strict, HttpOnly
 *  - Rate limiting: 5 attempts per 15 min per IP
 */

// ── Constants ───────────────────────────────────────────────────────────────

export const COOKIE_NAME = "sa_token";
const TOKEN_MAX_AGE_S = 60 * 60; // 1 hour
const TOKEN_MAX_AGE_MS = TOKEN_MAX_AGE_S * 1000;

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX_ATTEMPTS = 5;

// ── Helpers ─────────────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(sig);
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = b64urlDecode(signature);
  return crypto.subtle.verify("HMAC", key, sigBytes.buffer as ArrayBuffer, enc.encode(data));
}

// ── Rate Limiter ────────────────────────────────────────────────────────────

interface AttemptRecord {
  attempts: number[];
}

const rateLimitMap = new Map<string, AttemptRecord>();

/**
 * Check if an IP is rate-limited. Returns { allowed, remaining, retryAfterMs }.
 */
export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  const now = Date.now();
  let record = rateLimitMap.get(ip);

  if (!record) {
    record = { attempts: [] };
    rateLimitMap.set(ip, record);
  }

  // Prune expired attempts
  record.attempts = record.attempts.filter((t) => now - t < RATE_WINDOW_MS);

  if (record.attempts.length >= RATE_MAX_ATTEMPTS) {
    const oldest = record.attempts[0];
    const retryAfterMs = RATE_WINDOW_MS - (now - oldest);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  return {
    allowed: true,
    remaining: RATE_MAX_ATTEMPTS - record.attempts.length,
    retryAfterMs: 0,
  };
}

/** Record a failed login attempt for rate limiting. */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  let record = rateLimitMap.get(ip);
  if (!record) {
    record = { attempts: [] };
    rateLimitMap.set(ip, record);
  }
  record.attempts.push(now);

  // Cleanup old IPs periodically (every 100 entries)
  if (rateLimitMap.size > 100) {
    const keys = Array.from(rateLimitMap.keys());
    for (const key of keys) {
      const val = rateLimitMap.get(key)!;
      val.attempts = val.attempts.filter((t) => now - t < RATE_WINDOW_MS);
      if (val.attempts.length === 0) rateLimitMap.delete(key);
    }
  }
}

// ── Password Verification ───────────────────────────────────────────────────

function getPassword(): string {
  const pw = process.env.SUPER_ADMIN_PASSWORD;
  if (!pw) throw new Error("SUPER_ADMIN_PASSWORD is not set");
  return pw;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to maintain constant time relative to `a` length
    let mismatch = 1;
    for (let i = 0; i < a.length; i++) {
      mismatch |= a.charCodeAt(i) ^ (b.charCodeAt(i % b.length) || 0);
    }
    // Use mismatch to prevent dead-code elimination
    return mismatch === 0; // always false since mismatch starts at 1
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Verify a password attempt. */
export function verifyPassword(attempt: string): boolean {
  const password = getPassword();
  return timingSafeEqual(attempt, password);
}

// ── Token Creation & Verification ───────────────────────────────────────────

/** Derive a signing key from the password. Separates auth credential from token signing. */
async function getSigningKey(): Promise<string> {
  const password = getPassword();
  return await hmacSign("sa-token-signing-v1", password);
}

/**
 * Create a signed session token.
 * Format: `timestamp.signature` where signature = HMAC-SHA256(timestamp, secret)
 */
export async function createToken(): Promise<string> {
  const secret = await getSigningKey();
  const timestamp = String(Date.now());
  const signature = await hmacSign(timestamp, secret);
  return `${timestamp}.${signature}`;
}

/**
 * Verify a session token. Returns true if valid and not expired.
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = await getSigningKey();
    const dotIndex = token.indexOf(".");
    if (dotIndex === -1) return false;

    const timestamp = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    // Check expiry
    const ts = Number(timestamp);
    if (isNaN(ts) || Date.now() - ts > TOKEN_MAX_AGE_MS) return false;

    // Verify HMAC
    return await hmacVerify(timestamp, signature, secret);
  } catch {
    return false;
  }
}

// ── Cookie Options ──────────────────────────────────────────────────────────

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/super-admin",
  maxAge: TOKEN_MAX_AGE_S,
};
