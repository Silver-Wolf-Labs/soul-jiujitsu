"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import AdminSidebar from "./AdminSidebar";
import { useGymProfile } from "@/lib/gym-profile-context";

export default function AdminShell() {
  const profile = useGymProfile();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, static column on md+ */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:sticky md:top-0 md:z-auto md:h-screen transform transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <AdminSidebar onClose={() => setOpen(false)} />
      </div>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center justify-between px-4 bg-black border-b border-white/10">
        <button
          onClick={() => setOpen(true)}
          className="text-white/70 hover:text-white p-1 -ml-1"
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="font-display text-base text-white">
          {profile.logoText}{" "}
          <span className="text-yellow">•</span>{" "}
          <span className="text-white/50 text-sm font-body font-semibold tracking-wider uppercase">Admin</span>
        </div>
        <Link href="/" className="text-white/50 hover:text-white text-xs font-mono tracking-wide inline-flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />Site
        </Link>
      </header>
    </>
  );
}
