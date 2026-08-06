"use client";

import { useState, useEffect } from "react";
import SessionWarning from "@/components/ui/SessionWarning";

const IDLE_MS = 15 * 60 * 1000;     // 15 minutes — tighter than admin (30 min)
const HARD_MS = 60 * 60 * 1000;     // 1 hour — matches token TTL

export default function SuperAdminSessionGuard() {
  const [hardExpiresAt, setHardExpiresAt] = useState<number | undefined>();

  useEffect(() => {
    // Hard expiry starts when the page first loads (approximates login time)
    setHardExpiresAt(Date.now() + HARD_MS);
  }, []);

  if (!hardExpiresAt) return null;

  return (
    <SessionWarning
      idleMs={IDLE_MS}
      hardExpiresAt={hardExpiresAt}
      redirectPath="/super-admin/login"
      variant="dark"
    />
  );
}
