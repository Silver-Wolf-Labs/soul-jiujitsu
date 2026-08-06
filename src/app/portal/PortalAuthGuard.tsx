"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PortalAuthGuard() {
  const router = useRouter();

  useEffect(() => {
    function checkAuth() {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          router.replace("/portal/login");
        }
      });
    }

    // Handle bfcache: when user hits back button after logout,
    // the pageshow event fires with persisted=true
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        checkAuth();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  return null;
}
