"use server";

import { cookies, headers } from "next/headers";
import {
  verifyPassword,
  createToken,
  checkRateLimit,
  recordFailedAttempt,
  COOKIE_NAME,
  COOKIE_OPTIONS,
} from "@/lib/super-admin/auth";

export interface LoginResult {
  success: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

export async function superAdminLogin(password: string): Promise<LoginResult> {
  // ── Rate limit check ────────────────────────────────────────────────────
  const headersList = await headers();
  const ip =
    headersList.get("x-real-ip") ||
    headersList.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";

  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    console.warn(`[super-admin] Rate limited IP: ${ip}`);
    const retryAfterSeconds = Math.ceil(rateCheck.retryAfterMs / 1000);
    return {
      success: false,
      error: `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      retryAfterSeconds,
    };
  }

  // ── Validate password ──────────────────────────────────────────────────
  if (!password || !verifyPassword(password)) {
    recordFailedAttempt(ip);
    console.warn(`[super-admin] Failed login attempt from IP: ${ip}`);
    return { success: false, error: "Invalid password." };
  }

  // ── Create session ─────────────────────────────────────────────────────
  const token = await createToken();
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, COOKIE_OPTIONS);
  console.info(`[super-admin] Successful login from IP: ${ip}`);

  return { success: true };
}

export async function superAdminLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: COOKIE_NAME, path: "/super-admin" });
}
