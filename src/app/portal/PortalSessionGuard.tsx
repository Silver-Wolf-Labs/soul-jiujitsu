"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import SessionWarning from "@/components/ui/SessionWarning";

const IDLE_MS = 60 * 60 * 1000;     // 1 hour
const HARD_MS = 2 * 60 * 60 * 1000; // 2 hours

export default function PortalSessionGuard() {
  const [hardExpiresAt, setHardExpiresAt] = useState<number | undefined>();

  useEffect(() => {
    const raw = sessionStorage.getItem("session_started_at");
    const startedAt = raw ? Number(raw) : Date.now();
    setHardExpiresAt(startedAt + HARD_MS);
  }, []);

  const handleExtend = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.getUser();
  }, []);

  if (!hardExpiresAt) return null;

  return (
    <SessionWarning
      idleMs={IDLE_MS}
      hardExpiresAt={hardExpiresAt}
      redirectPath="/portal/login"
      onExtend={handleExtend}
      variant="light"
    />
  );
}
