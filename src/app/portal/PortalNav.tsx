"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useGymProfile } from "@/lib/gym-profile-context";
import PortalSignOutButton from "./PortalSignOutButton";

export default function PortalNav() {
  const pathname = usePathname();
  const profile = useGymProfile();
  const [memberName, setMemberName] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsAuthenticated(true);
        const { data: member } = await supabase
          .from("members")
          .select("first_name, last_name")
          .eq("user_id", session.user.id)
          .single();
        if (member) {
          setMemberName(`${member.first_name} ${member.last_name}`);
        }
      } else {
        setIsAuthenticated(false);
        setMemberName(null);
      }
      setChecked(true);
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Don't show navbar on login page or before auth check
  if (!checked || !isAuthenticated || pathname === "/portal/login") {
    return null;
  }

  return (
    <nav className="bg-white border-b border-line">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/portal" className="font-display text-lg text-black tracking-tight">
          {profile.logoText} &bull; {profile.cityName.toUpperCase()}
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="/portal"
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            Profile
          </Link>
          <Link
            href="/"
            className="text-sm text-muted hover:text-ink transition-colors hidden sm:block"
          >
            &larr; Back to site
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {memberName && (
            <span className="text-xs text-muted hidden sm:block">{memberName}</span>
          )}
          <PortalSignOutButton />
        </div>
      </div>
    </nav>
  );
}
