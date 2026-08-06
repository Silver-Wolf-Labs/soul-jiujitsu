"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGymProfile } from "@/lib/gym-profile-context";
import { useNavigation } from "./NavigationContext";

// ── Inline SVG icon set (Lucide-style, 16×16 stroke) ─────────────────────────

function Icon({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-4 h-4 flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const Icons = {
  Dashboard: () => (
    <Icon>
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </Icon>
  ),
  Calendar: () => (
    <Icon>
      <rect x="1.5" y="3" width="13" height="11.5" rx="1.5" />
      <path d="M10.5 1.5v3M5.5 1.5v3M1.5 7h13" />
    </Icon>
  ),
  Bell: () => (
    <Icon>
      <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3 1 3.5 1 3.5H2.5s1-.5 1-3.5A4.5 4.5 0 0 1 8 1.5z" />
      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
    </Icon>
  ),
  Users: () => (
    <Icon>
      <circle cx="5.5" cy="5" r="2.5" />
      <path d="M1 14c0-2.8 2-4.5 4.5-4.5S10 11.2 10 14" />
      <circle cx="12" cy="5" r="2" opacity=".55" />
      <path d="M11.5 9.5c1.8.2 3 1.5 3 3" opacity=".55" />
    </Icon>
  ),
  Pen: () => (
    <Icon>
      <path d="M11 2.5 13.5 5 5.5 13H3v-2.5L11 2.5z" />
      <path d="M9 4.5 11.5 7" />
    </Icon>
  ),
  HelpCircle: () => (
    <Icon>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6 6.2a2 2 0 0 1 4 .7c0 1.5-2 1.8-2 3.6" />
      <circle cx="8" cy="13" r=".5" fill="currentColor" stroke="none" />
    </Icon>
  ),
  Megaphone: () => (
    <Icon>
      <path d="M12.5 2.5v11L7 10.5H4a2 2 0 0 1-2-2v-.5a2 2 0 0 1 2-2h3l5.5-3.5z" />
      <path d="M4 10.5V14" />
    </Icon>
  ),
  User: () => (
    <Icon>
      <circle cx="8" cy="5.5" r="3" />
      <path d="M2 15c0-3 2.7-5 6-5s6 2 6 5" />
    </Icon>
  ),
  CreditCard: () => (
    <Icon>
      <rect x="1" y="3.5" width="14" height="9" rx="1.5" />
      <path d="M1 7h14" />
      <path d="M4 11h2.5" />
    </Icon>
  ),
  FileCheck: () => (
    <Icon>
      <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.5L9.5 1.5z" />
      <path d="M9.5 1.5V6.5H13" />
      <path d="M5.5 10l1.5 1.5 3-3" />
    </Icon>
  ),
  DollarSign: () => (
    <Icon>
      <path d="M8 1.5v13" />
      <path d="M11 4.5H6.5a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 1 0 5H5" />
    </Icon>
  ),
  Layout: () => (
    <Icon>
      <rect x="1" y="1.5" width="14" height="13" rx="1.5" />
      <path d="M1 6.5h14M6 6.5v8" />
    </Icon>
  ),
  Layers: () => (
    <Icon>
      <path d="M1.5 6 8 3l6.5 3L8 9 1.5 6z" />
      <path d="M1.5 10.5 8 13.5l6.5-3" />
    </Icon>
  ),
  Menu: () => (
    <Icon>
      <path d="M2 4.5h12M2 8h12M2 11.5h8" />
    </Icon>
  ),
  Image: () => (
    <Icon>
      <rect x="1" y="2.5" width="14" height="11" rx="1.5" />
      <circle cx="5.5" cy="6.5" r="1.5" />
      <path d="M1 11l4-3.5 3 2.5 2-2 5 5" />
    </Icon>
  ),
  MapPin: () => (
    <Icon>
      <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5C12.5 10 8 14.5 8 14.5S3.5 10 3.5 6A4.5 4.5 0 0 1 8 1.5z" />
      <circle cx="8" cy="6" r="1.5" />
    </Icon>
  ),
  Sliders: () => (
    <Icon>
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
      <rect x="9.5" y="3" width="3" height="3" rx="1" />
      <rect x="3.5" y="6.5" width="3" height="3" rx="1" />
      <rect x="9.5" y="10" width="3" height="3" rx="1" />
    </Icon>
  ),
  Mail: () => (
    <Icon>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M1.5 5.5l6.5 4.5 6.5-4.5" />
    </Icon>
  ),
  MessageSquare: () => (
    <Icon>
      <rect x="1.5" y="1.5" width="13" height="10" rx="1.5" />
      <path d="M4 14l2.5-2.5H10" />
    </Icon>
  ),
  Clock: () => (
    <Icon>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.5v3.8l2.5 1.7" />
    </Icon>
  ),
  Settings: () => (
    <Icon>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </Icon>
  ),
  Sections: () => (
    <Icon>
      <rect x="1.5" y="1.5" width="13" height="4" rx="1" />
      <rect x="1.5" y="7.5" width="13" height="3" rx="1" />
      <rect x="1.5" y="12.5" width="13" height="2" rx="1" />
    </Icon>
  ),
  Tablet: () => (
    <Icon>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
      <circle cx="8" cy="12.5" r=".6" fill="currentColor" stroke="none" />
    </Icon>
  ),
  ExternalLink: () => (
    <Icon>
      <path d="M7 2H2.5A1.5 1.5 0 0 0 1 3.5v10A1.5 1.5 0 0 0 2.5 15h10A1.5 1.5 0 0 0 14 13.5V9" />
      <path d="M9 1.5H14.5V7" />
      <path d="M14.5 1.5 7.5 8.5" />
    </Icon>
  ),
  Power: () => (
    <Icon>
      <path d="M8 2v5" />
      <path d="M5 3.8A5.5 5.5 0 1 0 11 3.8" />
    </Icon>
  ),
  TrendUp: () => (
    <Icon>
      <path d="M1.5 12.5 6 8l3 3 5.5-6" />
      <path d="M10.5 2.5h4v4" />
    </Icon>
  ),
  BarChart: () => (
    <Icon>
      <path d="M2 14V9M6 14V5M10 14v-7M14 14v-11" />
    </Icon>
  ),
  Whistle: () => (
    <Icon>
      <circle cx="6.5" cy="9.5" r="4" />
      <path d="M10.5 9.5 14.5 7" />
      <path d="M6.5 4V2h5" />
    </Icon>
  ),
  UsersPulse: () => (
    <Icon>
      <circle cx="5.5" cy="5" r="2.5" />
      <path d="M1 14c0-2.8 2-4.5 4.5-4.5" />
      <path d="M8 13.5h1.5l1-2 1 3 1-2 1 1h1.5" />
    </Icon>
  ),
};

// ── Nav structure ─────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  Icon: React.FC;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Analytics",
    items: [
      { label: "Overview",    href: "/admin/analytics",             Icon: Icons.TrendUp },
      { label: "Attendance",  href: "/admin/analytics/attendance",  Icon: Icons.BarChart },
      { label: "Members",     href: "/admin/analytics/members",     Icon: Icons.UsersPulse },
      { label: "Instructors", href: "/admin/analytics/instructors", Icon: Icons.Whistle },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Dashboard",     href: "/admin",           Icon: Icons.Dashboard },
      { label: "Schedule",      href: "/admin/schedule",  Icon: Icons.Calendar },
      { label: "Classes",       href: "/admin/classes",   Icon: Icons.Layers },
      { label: "Updates",       href: "/admin/updates",   Icon: Icons.Bell },
      { label: "Team",          href: "/admin/team",      Icon: Icons.Users },
      { label: "Blog",          href: "/admin/blog",      Icon: Icons.Pen },
      { label: "FAQ",           href: "/admin/faq",       Icon: Icons.HelpCircle },
      { label: "Banners",       href: "/admin/banners",   Icon: Icons.Megaphone },
    ],
  },
  {
    label: "Members",
    items: [
      { label: "Members",          href: "/admin/members",          Icon: Icons.User },
      { label: "Plans & Pricing",  href: "/admin/membership-plans", Icon: Icons.CreditCard },
      { label: "Waivers",          href: "/admin/waivers",          Icon: Icons.FileCheck },
      { label: "Kiosk",            href: "/admin/kiosk",            Icon: Icons.Tablet },
      { label: "Billing",          href: "/admin/billing",          Icon: Icons.DollarSign },
    ],
  },
  {
    label: "Site",
    items: [
      { label: "Hero",         href: "/admin/hero",       Icon: Icons.Layout },
      { label: "Sections",     href: "/admin/sections",   Icon: Icons.Sections },
      { label: "Navigation",   href: "/admin/nav",        Icon: Icons.Menu },
      { label: "Media",        href: "/admin/assets",     Icon: Icons.Image },
      { label: "Location",     href: "/admin/location",   Icon: Icons.MapPin },
      { label: "Appearance",   href: "/admin/appearance", Icon: Icons.Sliders },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Subscribers", href: "/admin/subscribers", Icon: Icons.Mail },
      { label: "Contacts",    href: "/admin/contacts",    Icon: Icons.MessageSquare },
      { label: "Audit Log",   href: "/admin/audit",       Icon: Icons.Clock },
      { label: "Settings",    href: "/admin/settings",    Icon: Icons.Settings },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose?: () => void;
}

export default function AdminSidebar({ onClose }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const profile  = useGymProfile();
  const { setPending } = useNavigation();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear optimistic state once the real pathname catches up
  useEffect(() => {
    setPendingHref(null);
    setPending(false);
  // setPendingHref is a stable setState setter — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, setPending]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  function isActive(href: string) {
    const current = pendingHref ?? pathname;
    if (href === "/admin") return current === "/admin";
    // Analytics Overview is a parent route (other analytics pages live
    // under it). Without an exact-match guard, "Overview" would stay lit
    // while the user is actually on Attendance/Members/Instructors.
    if (href === "/admin/analytics") return current === "/admin/analytics";
    return current === href || current.startsWith(href + "/");
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-black h-screen flex flex-col border-r border-white/[0.06]">

      {/* ── Logo ── */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-white/[0.06]">
        <div>
          <div className="font-display text-[17px] text-white leading-none tracking-wide">
            {profile.logoText}
            <span className="text-yellow">{profile.logoDot}</span>
            {" "}{profile.cityName}
          </div>
          <div className="text-[10px] text-white/25 mt-1 font-mono tracking-[0.2em] uppercase">
            Admin
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden text-white/30 hover:text-white/70 p-1 -mr-1 transition-colors"
            aria-label="Close menu"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="w-4 h-4">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Nav groups ── */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase text-white/25 select-none">
              {group.label}
            </div>
            <div className="space-y-px">
              {group.items.map(({ label, href, Icon: ItemIcon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => { setPendingHref(href); setPending(true); onClose?.(); }}
                    className={`
                      flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium
                      transition-colors duration-100 group relative
                      ${active
                        ? "bg-white/[0.08] text-white"
                        : "text-white/45 hover:text-white/80 hover:bg-white/[0.04]"
                      }
                    `}
                  >
                    {active && (
                      <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-yellow rounded-full" />
                    )}
                    <span className={active ? "text-white" : "text-white/35 group-hover:text-white/60 transition-colors"}>
                      <ItemIcon />
                    </span>
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="px-2.5 pb-4 pt-3 border-t border-white/[0.06] space-y-px">
        <Link
          href="/"
          target="_blank"
          onClick={onClose}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium text-white/35 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
        >
          <Icons.ExternalLink />
          View site
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium text-white/35 hover:text-danger hover:bg-white/[0.04] transition-colors cursor-pointer font-body text-left"
        >
          <Icons.Power />
          Sign out
        </button>
      </div>
    </aside>
  );
}
