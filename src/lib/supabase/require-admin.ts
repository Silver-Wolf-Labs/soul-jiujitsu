import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * Role hierarchy (highest → lowest):
 *   owner    — full access; can do everything
 *   manager  — day-to-day admin; can't delete members, change billing,
 *              edit waiver templates, rotate kiosk PIN, or change roles
 *   staff    — kiosk + member lookup + schedule view only
 *   member   — portal access only
 *
 * Legacy rows with role='admin' (from before the hardening sprint) are
 * treated as 'owner' — single-admin today = single-owner tomorrow.
 */
export type Role = "owner" | "manager" | "admin" | "staff" | "member";

/** Roles that satisfy the "any admin surface" gate. */
const ADMIN_ROLES: readonly Role[] = ["owner", "manager", "admin"] as const;
/** Roles with owner-level privilege (destructive / billing / legal ops). */
const OWNER_ROLES: readonly Role[] = ["owner", "admin"] as const;
/** Roles that can use the kiosk + staff surfaces. */
const STAFF_ROLES: readonly Role[] = ["owner", "manager", "admin", "staff"] as const;

interface ProfileCheck {
  role: Role;
  is_admin: boolean;
  is_legacy_admin: boolean;  // role='admin' OR is_admin=true
}

/**
 * Load the caller's profile once per render. `React.cache` ensures the
 * Supabase auth round-trip happens exactly once per request even when
 * many nested Server Components each need to gate on a role.
 */
const loadCallerProfile = cache(async (): Promise<ProfileCheck | null> => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const role = profile.role as Role;
  const isAdmin = !!profile.is_admin;
  return {
    role,
    is_admin: isAdmin,
    is_legacy_admin: role === "admin" || isAdmin,
  };
});

async function requireAuthenticatedUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  return user;
}

/**
 * Owner-level gate. Use for:
 *   - Deleting members
 *   - Changing membership plans or billing
 *   - Editing waiver templates
 *   - Rotating the kiosk PIN
 *   - Changing another user's role
 *   - Managing team / instructors / payouts
 *
 * Redirects unauthenticated or under-privileged users to /admin/login.
 * Returns the authenticated user on success.
 */
export async function requireOwner() {
  const user = await requireAuthenticatedUser();
  const p = await loadCallerProfile();
  const ok = p && (OWNER_ROLES.includes(p.role) || p.is_legacy_admin);
  if (!ok) redirect("/admin/login");
  return user;
}

/**
 * Manager-or-higher gate. Use for day-to-day admin work:
 *   - Editing members' attendance, belt history, notes
 *   - Changing the schedule (add/edit/delete classes)
 *   - Publishing updates, blog posts, banners
 *   - Running reports
 *
 * Redirects under-privileged users to /admin/login.
 */
export async function requireManager() {
  const user = await requireAuthenticatedUser();
  const p = await loadCallerProfile();
  const ok = p && (ADMIN_ROLES.includes(p.role) || p.is_legacy_admin);
  if (!ok) redirect("/admin/login");
  return user;
}

/**
 * Staff-or-higher gate. Use for the kiosk + anything a front-desk
 * employee should be able to do (member lookup, check-in, read schedule).
 */
export async function requireStaff() {
  const user = await requireAuthenticatedUser();
  const p = await loadCallerProfile();
  const ok = p && (STAFF_ROLES.includes(p.role) || p.is_legacy_admin);
  if (!ok) redirect("/admin/login");
  return user;
}

/**
 * Legacy alias — preserved so existing callsites work. Behaves as
 * `requireManager()`: any admin-tier role satisfies it. Over time we'll
 * migrate specific callsites to the sharper gate (requireOwner where
 * destructive, requireStaff where read-only enough), but the default
 * continues to be "manager OK."
 */
export async function requireAdmin() {
  return requireManager();
}

/**
 * Loose role-check — returns (not redirects) a tag describing what
 * surface the caller can see. Useful for conditionally rendering nav
 * items in an admin layout: staff doesn't see "Billing," manager
 * doesn't see "Waiver templates," etc.
 */
export async function getCallerCapability(): Promise<
  "owner" | "manager" | "staff" | "none"
> {
  const p = await loadCallerProfile();
  if (!p) return "none";
  if (OWNER_ROLES.includes(p.role) || p.is_legacy_admin) return "owner";
  if (p.role === "manager") return "manager";
  if (p.role === "staff") return "staff";
  return "none";
}

/**
 * Explicit role list gate — redirects if the caller doesn't have one
 * of the allowed roles. Use sparingly; prefer the named helpers above.
 */
export async function requireRole(roles: Role | readonly Role[]) {
  const allowed = Array.isArray(roles) ? roles : [roles as Role];
  const user = await requireAuthenticatedUser();
  const p = await loadCallerProfile();
  const ok = p && (allowed.includes(p.role) || (allowed.includes("admin") && p.is_legacy_admin));
  if (!ok) redirect("/admin/login");
  return user;
}
