"use client";

import { createContext, useContext } from "react";
import type { GymProfile } from "@/lib/gym-profile";

const GymProfileContext = createContext<GymProfile | null>(null);

export function GymProfileProvider({
  profile,
  children,
}: {
  profile: GymProfile;
  children: React.ReactNode;
}) {
  return (
    <GymProfileContext.Provider value={profile}>
      {children}
    </GymProfileContext.Provider>
  );
}

/**
 * Access the gym profile from any client component.
 * Must be rendered inside <GymProfileProvider>.
 */
export function useGymProfile(): GymProfile {
  const ctx = useContext(GymProfileContext);
  if (!ctx) throw new Error("useGymProfile must be used within GymProfileProvider");
  return ctx;
}
