"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";

/**
 * Sign-out link rendered on /waiver so a user stranded mid-onboarding has
 * an explicit escape. Without this, anyone who signed up but didn't finish
 * the waiver — including someone on a shared or public computer — gets
 * dumped onto the waiver page the next time they hit /portal with no way
 * out except completing the signature.
 *
 * Client component because supabase.auth.signOut() must run in the browser
 * to clear the cookie-bound session before we navigate away.
 */
export default function WaiverSignOutLink() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="text-xs text-muted hover:text-ink underline underline-offset-2 disabled:opacity-50 transition-colors"
    >
      {busy ? <span className="inline-flex items-center gap-1"><Spinner size="sm" delay={false} /> Signing out</span> : "Not you? Sign out"}
    </button>
  );
}
