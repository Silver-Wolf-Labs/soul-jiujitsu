"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import SessionWarning from "@/components/ui/SessionWarning";
import { DEFAULT_ADMIN_SESSION_TTL, ADMIN_SESSION_TTL_MS } from "@/lib/admin-session-config";

const IDLE_MS = 30 * 60 * 1000; // 30 minutes — separate from the configurable hard TTL

interface Props {
  /**
   * Hard session TTL in ms. Supplied by the admin layout from `site_settings`.
   * Falls back to the library default when omitted so this component stays
   * usable anywhere (tests, orphan mounts, etc.).
   */
  hardMs?: number;
}

/**
 * Wraps the shared `SessionWarning` modal with admin-specific defaults:
 *   - Idle timeout: 30 min (hard-coded — separate UX concern from session TTL)
 *   - Hard session lifetime: configurable via `admin_session_ttl` site setting
 *   - On extend: re-fetches the Supabase user to refresh the access token
 */
export default function AdminSessionGuard({ hardMs }: Props = {}) {
  const [hardExpiresAt, setHardExpiresAt] = useState<number | undefined>();

  useEffect(() => {
    // The admin login flow doesn't write `session_started_at` today, so this
    // falls back to `Date.now()` on first mount — meaning the hard ceiling
    // is effectively (now + hardMs) from the first page load in a session.
    // That's a UX hint, not the true security ceiling (Supabase's own
    // access-token rotation is the real lockout).
    const raw = sessionStorage.getItem("session_started_at");
    const startedAt = raw ? Number(raw) : Date.now();
    const ttlMs = hardMs ?? ADMIN_SESSION_TTL_MS[DEFAULT_ADMIN_SESSION_TTL];
    setHardExpiresAt(startedAt + ttlMs);
  }, [hardMs]);

  const handleExtend = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.getUser();
  }, []);

  if (!hardExpiresAt) return null;

  return (
    <SessionWarning
      idleMs={IDLE_MS}
      hardExpiresAt={hardExpiresAt}
      redirectPath="/admin/login"
      onExtend={handleExtend}
      variant="light"
    />
  );
}
