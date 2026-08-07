import { UpdateType, BeltColor, TeamMemberType } from "../constants";

// ── Database row types ─────────────────────────────────────────────────────

export interface Update {
  id: number;
  type: UpdateType;
  title: string;
  body: string;
  date: string;
  published: boolean;
  expires_at: string | null;
  starts_at: string | null;
  display_order: number;
}

export interface ScheduleSlot {
  id: number;
  day_of_week: number;        // 1=Mon … 7=Sun
  start_time: string;         // "HH:MM:SS" from Postgres TIME
  end_time: string;
  title: string;
  /** FK to `class_modalities.id` — the core "what is this class?" axis
   *  (Gi / No-Gi / Open Mat / etc.). NOT NULL post-Phase-3; every slot
   *  must carry a modality. */
  modality_id: number;
  /** FK to `class_levels.id` — optional skill-progression axis
   *  (Fundamentals / Advanced / etc.). */
  level_id: number | null;
  area: string | null;
  /** Primary instructor's display name — mirrors `sort_order=0` in
   *  `schedule_slot_instructors`. Retained for backward compat with
   *  read paths; multi-instructor classes fill this with the primary only. */
  instructor_name: string | null;
  /** FK to `instructors.id` for the primary instructor. Analytics prefer
   *  `schedule_slot_instructors` for full multi-instructor attribution. */
  instructor_id: number | null;
  /** When true, render the instructor name publicly. */
  show_instructor: boolean;
  /** How `instructor_name(s)` are formatted publicly:
   *    - "full"       → "Walter Davis"
   *    - "first_only" → "Walter"
   *    - "last_only"  → "Davis" */
  instructor_name_display: "full" | "first_only" | "last_only";
  link_label: string | null;
  link_url: string | null;
  sort_order: number;
  active: boolean;
}

/**
 * Junction row for `schedule_slot_focuses` — zero-to-many topic/technique
 * tags on a slot (Leg Locks, Takedowns, Guard Passing, etc.). `sort_order`
 * preserves admin-chosen display order within the slot.
 */
export interface ScheduleSlotFocus {
  schedule_slot_id: number;
  focus_id: number;
  sort_order: number;
}

/**
 * Junction row for `schedule_slot_audiences` — zero-to-many typed
 * audience gates (age / gender / rank / access). Runtime enforcement
 * reads from the linked `class_audiences` row's per-kind metadata.
 */
export interface ScheduleSlotAudience {
  schedule_slot_id: number;
  audience_id: number;
}

/**
 * Junction row for `schedule_slot_instructors` — a single class-teacher
 * assignment. Classes with multiple instructors have multiple rows,
 * ordered by `sort_order` (0 = primary).
 */
export interface ScheduleSlotInstructor {
  schedule_slot_id: number;
  instructor_id: number;
  sort_order: number;
}

/**
 * Snapshot row for `check_in_instructors` — frozen attribution of a
 * single check-in to one (of possibly many) teachers. NULL
 * `instructor_id` is valid when the class used an inline stub or the
 * instructor was later purged; `instructor_name` preserves the label.
 */
export interface CheckInInstructor {
  check_in_id: number;
  instructor_id: number | null;
  instructor_name: string | null;
  sort_order: number;
}

export interface TeamMember {
  id: number;
  name: string;
  role: string;
  belt: BeltColor;
  bio: string;
  photo_url: string | null;
  slug: string;
  order: number;
  type: TeamMemberType;
  active: boolean;
  /** Controls whether this person surfaces on the public `/team` page.
   *  `owner` / `head_coach` / `instructor` default to true; `guest`
   *  (visiting / seminar coach) defaults to false and opts in. */
  visible_on_public_team: boolean;
  /** Optional auto-hide date — the public page filters out rows whose
   *  visibility window has expired. Useful for seminar coaches. */
  visible_until: string | null;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  body: string;
  tag: string;
  author: string;
  excerpt: string;
  published: boolean;
  created_at: string;
  starts_at: string | null;
  expires_at: string | null;
  display_order: number;
}

export interface Subscriber {
  id: number;
  value: string;
  mode: "email" | "sms";
  created_at: string;
}

export interface ContactSubmission {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  message: string;
  created_at: string;
  read: boolean;
}

export interface SiteSetting {
  key: string;
  value: string;
}

export interface SiteSection {
  id: number;
  key: string;
  label: string;
  display_order: number;
  visible: boolean;
  display_title: string | null;
  display_subtitle: string | null;
}

export interface Banner {
  id: number;
  text: string;
  color: string; // "black" | "blue" | "purple" | "brown" | "yellow"
  display_order: number;
  active: boolean;
  expires_at: string | null;
  starts_at: string | null;
  section: string; // "top" | "pricing"
  expanded: boolean;
  created_at: string;
}

export interface PricingPlan {
  id: number;
  tier: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  cta_href: string;
  featured: boolean;
  highlight_color: string | null;
  highlight_label: string | null;
  display_order: number;
  active: boolean;
  expires_at: string | null;
  starts_at: string | null;
  created_at: string;
}

export interface FAQItem {
  id: number;
  question: string;
  answer: string;
  display_order: number;
  active: boolean;
  expires_at: string | null;
  starts_at: string | null;
  created_at: string;
}

export type UserRole = "admin" | "staff" | "member";

export interface Profile {
  id: string;
  role: UserRole;
  is_admin: boolean;        // legacy column — kept for backward compat
  full_name: string | null;
  email: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  user_email: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "TOGGLE";
  table_name: string;
  record_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface NavItem {
  id: number;
  label: string;
  href: string;
  display_order: number;
  active: boolean;
  created_at: string;
}

export interface Asset {
  id: number;
  filename: string;
  storage_path: string;
  public_url: string;
  alt_text: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface FooterItem {
  id: number;
  label: string;
  href: string;
  group_name: string;
  display_order: number;
  active: boolean;
  created_at: string;
}

export type MemberStatus = "prospect" | "trial" | "active" | "inactive" | "suspended";
export type MembershipStatus = "trialing" | "active" | "paused" | "canceled" | "past_due";

export interface Member {
  id: number;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  notes: string | null;
  communication_opt_in: boolean;
  waiver_signed_at: string | null;
  waiver_status: "not_required" | "pending" | "signed" | "expired";
  created_at: string;
  // BJJ training info
  belt: "white" | "blue" | "purple" | "brown" | "black" | null;
  stripes: number;                    // 0–4
  belt_awarded_at: string | null;     // ISO date
  training_started_at: string | null; // ISO date
  // Demographics
  birth_month: number | null;        // 1–12
  birth_year: number | null;         // e.g. 1990
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  // Stripe
  stripe_customer_id: string | null;
}

export interface MembershipPlan {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  billing_interval: "month" | "year" | "one_time";
  trial_days: number;
  max_classes_per_week: number | null;
  status: "active" | "archived";
  created_at: string;
  // Display fields (merged from marketing pricing_plans)
  features: string[];
  highlight: boolean;
  highlight_color: string | null;  // 'black' | 'blue' | 'purple' | 'brown' | 'yellow' | null
  highlight_label: string | null;
  period_display: string | null;   // optional free-text override for the period line
  cta_label: string;
  cta_href: string;
  display_order: number;
  visible: boolean;
  // Stripe
  stripe_product_id: string | null;
  stripe_default_price_id: string | null;
}

export interface PlanPriceHistory {
  id: number;
  plan_id: number;
  old_price_cents: number;
  new_price_cents: number;
  scope: "new_only" | "all_current";
  changed_by: string | null;
  changed_at: string;
  excluded_member_ids: number[];
}

export interface MemberMembership {
  id: number;
  member_id: number;
  plan_id: number;
  status: MembershipStatus;
  started_at: string;
  ends_at: string | null;
  canceled_at: string | null;
  locked_price_cents: number;
  override_price_cents: number | null;
  override_note: string | null;
  effective_price_cents: number;        // generated: COALESCE(override, locked)
  paused_until: string | null;          // ISO timestamp; null when not paused
  plan_name: string | null;             // snapshot at assignment time
  plan_billing_interval: string | null; // snapshot at assignment time
  created_at: string;
  // Stripe
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  is_comp: boolean;
}

export interface MemberPurchase {
  id: number;
  member_id: number;
  plan_id: number;
  plan_name: string;
  plan_billing_interval: string;
  price_cents: number;
  purchased_at: string;
  notes: string | null;
  created_at: string;
  // Stripe
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
}

export interface StripeEvent {
  id: string;
  type: string;
  status: "pending" | "processed";
  created_at: string;
  processed_at: string | null;
  payload: Record<string, unknown>;
}

export interface WaiverTemplate {
  id: number;
  title: string;
  body_md: string;
  version: number;
  active: boolean;
  created_at: string;
}

export interface CheckIn {
  id: number;
  member_id: number;
  schedule_slot_id: number | null;
  class_name: string;
  class_date: string;           // ISO date "YYYY-MM-DD"
  checked_in_at: string;        // ISO timestamptz
  source: "kiosk" | "admin";
  created_at: string;
  /** Stable instructor reference (FK) snapshotted at write time.
   *  NULL when the check-in was not tied to a scheduled slot. */
  instructor_id: number | null;
  /** Instructor display name snapshot — frozen at write time so historical
   *  attribution survives later renames or slot edits. */
  instructor_name: string | null;
  /** Modality FK snapshotted at check-in time. The join key for analytics
   *  queries that survive modality renames. NULL for pre-migration check-ins
   *  that the backfill couldn't attribute (rare — surfaced in the
   *  schedule_slots_needs_review view that lived during Phase 1-2). */
  modality_id: number | null;
  /** Modality display name snapshot — frozen at write time so a later
   *  rename doesn't rewrite historical attribution. */
  modality_name: string | null;
  /** Level FK snapshotted at check-in time. NULL means the class had no
   *  level attribution at check-in time (which is valid — not every class
   *  has a level). */
  level_id: number | null;
  /** Level display name snapshot. See `modality_name`. */
  level_name: string | null;
}

// ── Class taxonomy dimensions (class-taxonomy-LLD §1) ─────────────────────

/**
 * Class modality — the core activity axis. Required on every schedule
 * slot (enforced after Phase 3). Soft-deactivatable via `active`.
 * `color` drives optional card theming (hex string, e.g. "#3E63DD").
 */
export interface ClassModality {
  id: number;
  name: string;
  slug: string;
  color: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Class level — optional skill-progression axis (Fundamentals /
 * Beginners / Intermediate / Advanced / All Levels). Zero-or-one per
 * slot.
 */
export interface ClassLevel {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Class focus — zero-to-many topic/technique tags per slot (Leg Locks,
 * Takedowns, etc.). Shape is identical to ClassLevel by design — these
 * are both flat label dimensions without per-kind metadata.
 */
export type ClassFocus = ClassLevel;

/**
 * Audience discriminator. Drives which enforcement columns
 * (`min_age` / `max_age` / `gender`) carry metadata and which are NULL.
 *
 * - `age`    → min_age / max_age set, gender NULL
 * - `gender` → gender set, min_age / max_age NULL
 * - `rank`   → all metadata NULL (label-only — "Black Belts Only")
 * - `access` → all metadata NULL (label-only — "Invite Only" / "Members Only")
 */
export type AudienceKind = "age" | "gender" | "rank" | "access";

/**
 * Class audience — typed "who can attend" gate. Zero-to-many per slot
 * in the `schedule_slot_audiences` junction. Kiosk `checkRestrictions`
 * reads the kind-specific metadata to decide whether to surface a
 * warning modal (with "Check In Anyway" override).
 */
export interface ClassAudience {
  id: number;
  name: string;
  slug: string;
  kind: AudienceKind;
  /** Populated only when `kind = 'age'`. Inclusive lower bound. NULL
   *  means "no lower bound" (used for "Age 40+" etc. alongside NULL max_age). */
  min_age: number | null;
  /** Populated only when `kind = 'age'`. Inclusive upper bound. NULL
   *  means "no upper bound". */
  max_age: number | null;
  /** Populated only when `kind = 'gender'`. Kiosk compares this to the
   *  member's gender; "other" / "prefer_not_to_say" never match. */
  gender: "female" | "male" | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Snapshot row for `check_in_focuses` — one row per focus on the check-in's
 * class at write time. `focus_id` is `ON DELETE SET NULL` so a hard-deleted
 * focus row leaves the snapshot's display name (`focus_name`) intact.
 * PK is `(check_in_id, sort_order)` because `focus_id` can go NULL.
 */
export interface CheckInFocus {
  check_in_id: number;
  focus_id: number | null;
  focus_name: string | null;
  sort_order: number;
}

/**
 * Snapshot row for `check_in_audiences` — one row per audience attribution
 * at check-in time. `audience_kind` carries forward so post-hoc analytics
 * can slice by kind even if the audience row is later deleted.
 */
export interface CheckInAudience {
  check_in_id: number;
  audience_id: number | null;
  audience_name: string | null;
  audience_kind: AudienceKind | null;
  sort_order: number;
}

/**
 * Stable instructor identity — the join key for analytics.
 * Name edits are recorded via `updated_at` by a DB trigger.
 */
export interface Instructor {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Slim check-in row used by the CheckInsList component.
 * A subset of CheckIn — omits member_id and schedule_slot_id which are
 * implementation details the display component doesn't need.
 */
export interface CheckInRow {
  id: number;
  class_name: string;
  /** ISO date "YYYY-MM-DD" — used by canUndo to detect same-day rows. */
  class_date: string;
  /** ISO timestamptz — displayed as the time of check-in. */
  checked_in_at: string;
  source: "kiosk" | "admin";
}

export interface BeltHistory {
  id: number;
  member_id: number;
  belt: "white" | "blue" | "purple" | "brown" | "black";
  stripes: number;
  event_type: "promotion" | "stripe" | "correction";
  notes: string | null;
  /** Admin email captured at write time. */
  promoted_by: string | null;
  /** Admin display name captured at write time — shown in the timeline. */
  promoted_by_name: string | null;
  promoted_at: string;
  created_at: string;
}

export interface WaiverSignature {
  id: number;
  member_id: number;
  template_id: number;
  template_version: number;
  signed_at: string;
  ip_address: string | null;
  snapshot_md: string;
  /** @deprecated Use signature_type + typed_initials / signature_path instead */
  signature_data: string | null;
  /** How the member signed: 'typed' (initials) or 'drawn' (canvas PNG) */
  signature_type: "typed" | "drawn" | null;
  /** Member-typed initials when signature_type = 'typed' */
  typed_initials: string | null;
  /** Supabase Storage object path in the 'signatures' bucket (drawn signatures) */
  signature_path: string | null;
}

export interface ArchivedWaiverSignature {
  id: number;
  original_id: number;
  member_id: number;
  member_name: string;
  member_email: string;
  template_id: number;
  template_version: number;
  signed_at: string;
  ip_address: string | null;
  snapshot_md: string;
  signature_type: "typed" | "drawn" | null;
  typed_initials: string | null;
  signature_path: string | null;
  archived_at: string;
  archived_by: string | null;
}

// ── Gamification ────────────────────────────────────────────────────────────

/** Badge rarity. Drives the colour a badge renders in — see TIER_STYLES. */
export type BadgeTier = "bronze" | "silver" | "gold" | "legendary";

/** What kind of achievement a badge represents, used to group the badge grid. */
export type BadgeCategory = "milestone" | "consistency" | "modality" | "skill" | "community";

/**
 * A badge in the catalogue.
 * Rules live in the row (not in app code) so the profe can add "50 Gi classes"
 * from the admin UI without a deploy. A NULL rule_kind means manual-only —
 * the professor awards it by hand.
 */
export interface Badge {
  id: number;
  slug: string;
  name: string;
  description: string;
  /** lucide-react icon name. Mapped through BADGE_ICONS, which falls back to Award. */
  icon: string;
  tier: BadgeTier;
  category: BadgeCategory;
  /** XP credited when the badge is earned. */
  xp_reward: number;
  /** Hidden from the "goals" grid until earned — a surprise. */
  secret: boolean;
  active: boolean;
  sort_order: number;
}

/**
 * A badge a member has actually earned, joined with its catalogue row.
 * `note` is the profe's personal message on a manual award — the part members
 * screenshot and share, so it's displayed verbatim.
 */
export interface EarnedBadge {
  badge: Badge;
  awarded_via: "auto" | "manual";
  awarded_at: string;
  note: string | null;
  /** NULL until the member has seen the celebration for it. */
  seen_at: string | null;
}

/**
 * The portal's gamification payload — one round-trip via get_member_gamification.
 * XP is summed from the xp_events ledger, never stored as a counter, so undoing
 * a check-in or revoking a badge can't leave it drifted.
 */
export interface MemberGamification {
  xp_total: number;
  level: number;
  /** Progress inside the current level — the numerator of the progress bar. */
  xp_into_level: number;
  /** Size of the current level — the denominator. Widens by 100 XP per level. */
  xp_for_level: number;
  /** Consecutive days the gym was OPEN and the member trained. */
  streak_days: number;
  /** Personal best, on the same open-day basis so it's always >= streak_days. */
  longest_streak: number;
  badges_earned: number;
  /** Non-secret active badges, i.e. how many are visible as goals. */
  badges_total: number;
  /** Earned but not yet celebrated on screen. */
  unseen_badges: number;
}

