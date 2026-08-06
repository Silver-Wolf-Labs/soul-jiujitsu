"use client";

import { usePathname } from "next/navigation";
import { useNavigation } from "./NavigationContext";

export default function AdminPageTransition({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const { isPending } = useNavigation();

  return (
    <div
      key={pathname}
      className="animate-admin-page-in"
      style={{ opacity: isPending ? 0 : undefined, transition: "opacity 0.1s ease" }}
    >
      {children}
    </div>
  );
}
