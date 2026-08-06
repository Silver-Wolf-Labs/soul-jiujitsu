"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PortalSignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/portal/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-sm px-3 py-1.5 border border-line rounded hover:bg-off-white transition-colors text-ink"
    >
      Sign Out
    </button>
  );
}
