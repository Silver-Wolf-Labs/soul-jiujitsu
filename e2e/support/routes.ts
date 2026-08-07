import { t } from "./messages";

/**
 * Single source of truth for what routes exist and how they should behave.
 *
 * Specs iterate this catalogue instead of hardcoding paths, so adding a route
 * here automatically extends smoke, SEO, a11y, layout, and console-error
 * coverage. Keep it in sync with `src/app/**` and `src/middleware.ts`.
 */

export type RouteAuth =
  /** Reachable by anyone, renders 200. */
  | "public"
  /** Middleware bounces unauthenticated visitors to a login page. */
  | "protected";

export interface RouteSpec {
  path: string;
  /** Human name used in test titles and the nightly report. */
  name: string;
  auth: RouteAuth;
  /**
   * Where middleware sends an unauthenticated visitor. Asserted exactly —
   * a protected route that redirects somewhere unexpected is a real auth bug,
   * not a detail. See `src/middleware.ts`.
   */
  redirectsTo?: string;
  /**
   * A visible string that proves the page actually rendered its own content
   * rather than an error boundary or an empty shell.
   */
  expectText?: string;
  /** Skip axe scanning — use only with a written reason. */
  skipA11y?: boolean;
  /**
   * Pages whose content comes from the DB and can legitimately be empty on a
   * fresh Supabase project. Content-integrity specs soften assertions here.
   */
  dataDriven?: boolean;
}

/**
 * Public routes. `expectText` values are drawn from the components rather than
 * from gym-profile fields, because gym identity is DB-configurable and would
 * make these assertions environment-dependent.
 */
export const PUBLIC_ROUTES: RouteSpec[] = [
  {
    path: "/",
    name: "Landing page",
    auth: "public",
    dataDriven: true,
  },
  {
    // From the catalogue, not a literal: the portal is Spanish now, so
    // "Member Login" is no longer on the page and this assertion failed on
    // chromium, mobile-chrome, webkit and a11y at once. Reading the real string
    // means it also follows the next rewording. See support/messages.
    path: "/portal/login",
    name: "Member login",
    auth: "public",
    expectText: t("portal.login.subtitle"),
  },
  {
    path: "/portal/forgot-password",
    name: "Forgot password",
    auth: "public",
  },
  {
    path: "/admin/login",
    name: "Admin login",
    auth: "public",
    expectText: "Admin Portal",
  },
  {
    path: "/kiosk",
    name: "Kiosk PIN unlock",
    auth: "public",
    expectText: "Front Desk Kiosk",
  },
  {
    path: "/join",
    name: "Join / signup",
    auth: "public",
  },
  {
    path: "/privacy",
    name: "Privacy policy",
    auth: "public",
  },
  {
    path: "/terms",
    name: "Terms of service",
    auth: "public",
  },
  {
    path: "/super-admin/login",
    name: "Super admin login",
    auth: "public",
  },
];

/**
 * Routes middleware must protect. Redirect targets mirror `src/middleware.ts`;
 * if that file's logic changes, these expectations must change with it.
 */
export const PROTECTED_ROUTES: RouteSpec[] = [
  { path: "/portal", name: "Member portal", auth: "protected", redirectsTo: "/portal/login" },
  { path: "/portal/profile", name: "Member profile", auth: "protected", redirectsTo: "/portal/login" },
  { path: "/admin", name: "Admin dashboard", auth: "protected", redirectsTo: "/admin/login" },
  { path: "/admin/members", name: "Admin members", auth: "protected", redirectsTo: "/admin/login" },
  { path: "/admin/schedule", name: "Admin schedule", auth: "protected", redirectsTo: "/admin/login" },
  { path: "/admin/settings", name: "Admin settings", auth: "protected", redirectsTo: "/admin/login" },
  { path: "/admin/analytics", name: "Admin analytics", auth: "protected", redirectsTo: "/admin/login" },
  { path: "/kiosk/checkin", name: "Kiosk check-in", auth: "protected", redirectsTo: "/kiosk" },
  { path: "/waiver", name: "Waiver signing", auth: "protected", redirectsTo: "/portal/login" },
  { path: "/super-admin", name: "Super admin console", auth: "protected", redirectsTo: "/super-admin/login" },
  { path: "/super-admin/setup", name: "Super admin setup", auth: "protected", redirectsTo: "/super-admin/login" },
];

/**
 * Admin routes walked by the authenticated crawl spec. This is every entry in
 * `AdminSidebar`'s nav groups — the point is that *no* admin page throws once
 * you're actually signed in, which is exactly the class of bug that never
 * shows up in a build or in Vitest.
 */
export const ADMIN_ROUTES: string[] = [
  "/admin",
  "/admin/schedule",
  "/admin/classes",
  "/admin/updates",
  "/admin/team",
  "/admin/blog",
  "/admin/faq",
  "/admin/banners",
  "/admin/members",
  "/admin/members/new",
  "/admin/membership-plans",
  "/admin/waivers",
  "/admin/kiosk",
  "/admin/billing",
  "/admin/hero",
  "/admin/sections",
  "/admin/nav",
  "/admin/assets",
  "/admin/location",
  "/admin/appearance",
  "/admin/subscribers",
  "/admin/contacts",
  "/admin/audit",
  "/admin/settings",
  "/admin/analytics",
  "/admin/analytics/attendance",
  "/admin/analytics/members",
  "/admin/analytics/instructors",
];

/** Landing page sections, keyed by the anchor id each renders. */
export const LANDING_SECTIONS = [
  { id: "updates", name: "News / updates" },
  { id: "mission", name: "Mission & vision" },
  { id: "schedule", name: "Class schedule" },
  { id: "rules", name: "Mat rules" },
  { id: "pricing", name: "Pricing" },
  { id: "team", name: "Team" },
  { id: "faq", name: "FAQ" },
  { id: "subscribe", name: "Subscribe" },
  { id: "contact", name: "Location & contact" },
] as const;

/** Nav links from `src/lib/constants.ts` — the DB can override, so treat as default. */
export const DEFAULT_NAV_LINKS = [
  { label: "Nosotros", href: "/#mission" },
  { label: "Horarios", href: "/#schedule" },
  { label: "Reglas", href: "/#rules" },
  { label: "Planes", href: "/#pricing" },
  { label: "Equipo", href: "/#team" },
  { label: "Contacto", href: "/#contact" },
] as const;

/**
 * Strings that must never reach rendered HTML. Mirrors
 * `scripts/smoke-test.ts` — leftovers from the upstream MGD Dallas template
 * this repo was forked from, plus unfilled `TODO_` setup placeholders.
 *
 * Deliberately NOT including "America/Chicago" as the smoke script does: the
 * timezone can legitimately appear in a `<time>` element or a schedule label,
 * and the browser-rendered DOM is a wider surface than the raw SSR HTML the
 * smoke script inspects. Keeping it out avoids a nightly false positive.
 */
export const FORBIDDEN_STRINGS = [
  "Marcelo Garcia",
  "marcelogarciadallas",
  "MGD Dallas",
  "5706 E Mockingbird",
  "TKR Jiu Jitsu",
  "TODO_",
] as const;

/** All routes, for specs that sweep everything regardless of auth. */
export const ALL_ROUTES: RouteSpec[] = [...PUBLIC_ROUTES, ...PROTECTED_ROUTES];
