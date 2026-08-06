import { colors } from "./theme";

// ── Enums ──────────────────────────────────────────────────────────────────

export enum ClassType {
  Gi = "gi",
  NoGi = "nogi",
  Youth = "youth",
  OpenMat = "openmat",
  Special = "special",
}

export enum UpdateType {
  Alert = "alert",
  Event = "event",
  Class = "class",
  News = "news",
}

export enum BeltColor {
  White = "white",
  Blue = "blue",
  Purple = "purple",
  Brown = "brown",
  Black = "black",
}

export enum TeamMemberType {
  Owner = "owner",
  HeadCoach = "head_coach",
  Instructor = "instructor",
  Guest = "guest",
}

// ── Class type display config ───────────────────────────────────────────────

export interface ClassTypeConfig {
  label: string;
  borderColor: string;   // Tailwind border color class
  bgColor: string;       // Tailwind bg color class
  hoverBg: string;       // Tailwind hover bg class
  dotColor: string;      // Tailwind bg for legend dot
  borderHex: string;     // CSS var for inline border-left-color (theme-responsive)
}

export const CLASS_TYPE_CONFIG: Record<ClassType, ClassTypeConfig> = {
  [ClassType.Gi]: {
    label: "Gi",
    borderColor: "border-l-blue",
    bgColor: "bg-blue-card",
    hoverBg: "hover:bg-blue-card-hover",
    dotColor: "bg-blue",
    borderHex: "var(--color-blue)",
  },
  [ClassType.NoGi]: {
    label: "No-Gi",
    borderColor: "border-l-purple",
    bgColor: "bg-purple-card",
    hoverBg: "hover:bg-purple-card-hover",
    dotColor: "bg-purple",
    borderHex: "var(--color-purple)",
  },
  [ClassType.Youth]: {
    label: "Youth",
    borderColor: "border-l-brown",
    bgColor: "bg-brown-card",
    hoverBg: "hover:bg-brown-card-hover",
    dotColor: "bg-brown",
    borderHex: "var(--color-brown)",
  },
  [ClassType.OpenMat]: {
    label: "Open Mat",
    borderColor: "border-l-near-black",
    bgColor: "bg-open-mat-card",
    hoverBg: "hover:bg-open-mat-card-hover",
    dotColor: "bg-near-black",
    borderHex: "var(--color-near-black)",
  },
  [ClassType.Special]: {
    label: "Special",
    borderColor: "border-l-yellow",
    bgColor: "bg-yellow-light",
    hoverBg: "hover:bg-special-card-hover",
    dotColor: "bg-yellow",
    borderHex: "var(--color-yellow)",
  },
};

// ── Update tag config ──────────────────────────────────────────────────────

export interface UpdateTagConfig {
  label: string;
  className: string;
}

export const UPDATE_TAG_CONFIG: Record<UpdateType, UpdateTagConfig> = {
  [UpdateType.Alert]: {
    label: "⚠ Alert",
    className: "bg-danger-light text-danger border border-danger-border",
  },
  [UpdateType.Event]: {
    label: "★ Event",
    className: "bg-yellow-light text-yellow-dark border border-yellow-border",
  },
  [UpdateType.Class]: {
    label: "+ New Class",
    className: "bg-success-light text-success border border-success-border",
  },
  [UpdateType.News]: {
    label: "News",
    className: "bg-blue-light text-blue border border-blue-news",
  },
};

// ── Belt SVG rendering colors (body / tip / border shades) ────────────────

export const BELT_BODY_HEX: Record<BeltColor, string> = {
  [BeltColor.White]:  colors.beltBodyWhite,
  [BeltColor.Blue]:   colors.beltBodyBlue,
  [BeltColor.Purple]: colors.beltBodyPurple,
  [BeltColor.Brown]:  colors.beltBodyBrown,
  [BeltColor.Black]:  colors.beltBodyBlack,
};

export const BELT_TIP_HEX: Record<BeltColor, string> = {
  [BeltColor.White]:  colors.beltTipWhite,
  [BeltColor.Blue]:   colors.beltTipBlue,
  [BeltColor.Purple]: colors.beltTipPurple,
  [BeltColor.Brown]:  colors.beltTipBrown,
  [BeltColor.Black]:  colors.beltTipBlack,
};

export const BELT_BORDER_HEX: Record<BeltColor, string> = {
  [BeltColor.White]:  colors.beltBorderWhite,
  [BeltColor.Blue]:   colors.beltBorderBlue,
  [BeltColor.Purple]: colors.beltBorderPurple,
  [BeltColor.Brown]:  colors.beltBorderBrown,
  [BeltColor.Black]:  colors.beltBorderBlack,
};

// ── Belt colors (for profile cards) ───────────────────────────────────────

export const BELT_COLOR_MAP: Record<BeltColor, string> = {
  [BeltColor.White]:  "var(--color-belt-white)",
  [BeltColor.Blue]:   "var(--color-belt-blue)",
  [BeltColor.Purple]: "var(--color-belt-purple)",
  [BeltColor.Brown]:  "var(--color-belt-brown)",
  [BeltColor.Black]:  "var(--color-belt-black)",
};

/**
 * Tailwind class pairs for belt buttons/badges (selected state).
 * Single source of truth — import in join page, portal profile, and kiosk.
 */
export const BELT_BUTTON_CLASSES: Record<BeltColor, string> = {
  [BeltColor.White]:  "bg-belt-white border-line-dark text-ink",
  [BeltColor.Blue]:   "bg-belt-blue border-belt-blue text-white",
  [BeltColor.Purple]: "bg-belt-purple border-belt-purple text-white",
  [BeltColor.Brown]:  "bg-belt-brown border-belt-brown text-white",
  [BeltColor.Black]:  "bg-belt-black border-belt-black text-white",
};

/** Tailwind dot classes for belt-colored timeline indicators. */
export const BELT_DOT_CLASS: Record<BeltColor, string> = {
  [BeltColor.White]:  "bg-white border border-line",
  [BeltColor.Blue]:   "bg-blue",
  [BeltColor.Purple]: "bg-purple",
  [BeltColor.Brown]:  "bg-brown",
  [BeltColor.Black]:  "bg-black",
};

/** Tailwind text-color classes for belt-labeled text. */
export const BELT_TEXT_CLASS: Record<BeltColor, string> = {
  [BeltColor.White]:  "text-ink",
  [BeltColor.Blue]:   "text-blue",
  [BeltColor.Purple]: "text-purple",
  [BeltColor.Brown]:  "text-brown",
  [BeltColor.Black]:  "text-ink",
};

/** Maximum stripes per belt level (colored belts: 4, black belt degrees: 6). */
export const STRIPE_MAX: Record<BeltColor, number> = {
  [BeltColor.White]:  4,
  [BeltColor.Blue]:   4,
  [BeltColor.Purple]: 4,
  [BeltColor.Brown]:  4,
  [BeltColor.Black]:  6,
};

// ── Team member badge config ───────────────────────────────────────────────

export const TEAM_TYPE_CONFIG: Record<TeamMemberType, { label: string; className: string }> = {
  [TeamMemberType.Owner]: {
    label: "Owner",
    className: "bg-brown-light text-brown border border-brown",
  },
  [TeamMemberType.HeadCoach]: {
    label: "Head Coach",
    className: "bg-purple-light text-purple border border-purple-badge",
  },
  [TeamMemberType.Instructor]: {
    label: "Instructor",
    className: "bg-purple-light text-purple border border-purple-badge",
  },
  [TeamMemberType.Guest]: {
    label: "Guest",
    className: "bg-yellow-light text-yellow-deep border border-yellow-border",
  },
};

// ── Nav links ──────────────────────────────────────────────────────────────

export const NAV_LINKS = [
  { label: "News", href: "/#updates" },
  { label: "Schedule", href: "/#schedule" },
  { label: "Team", href: "/#team" },
  { label: "Blog", href: "/#blog" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Contact", href: "/#contact" },
] as const;

// ── Schedule slot enums ────────────────────────────────────────────────────
// The legacy SCHEDULE_CATEGORIES / SCHEDULE_DISCIPLINES / SCHEDULE_LEVELS
// scalars were dropped in Phase 3 migration 20240168. Classes are now
// classified via the `class_modalities` / `class_levels` / `class_focuses`
// / `class_audiences` tables, editable from /admin/classes.

// ── Days of the week ──────────────────────────────────────────────────────

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// ── Blog tags ──────────────────────────────────────────────────────────────

export const BLOG_TAGS = [
  "Technique",
  "Competition",
  "Beginner",
  "News",
  "Guest Post",
] as const;

export type BlogTag = (typeof BLOG_TAGS)[number];

// ── FAQ data ───────────────────────────────────────────────────────────────

export interface FAQItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: "What is Brazilian Jiu-Jitsu?",
    answer:
      "A grappling martial art built around control, leverage, and submissions — chokes and joint locks. Think wrestling, but with controlled techniques that can end a fight. Developed from Japanese Jiu-Jitsu by Brazilians in the mid-20th century.",
  },
  {
    question: "Is this like UFC or MMA?",
    answer:
      "BJJ is one of the core parts of MMA, alongside striking and wrestling. In BJJ there's no striking — so no worries. We have coaches with MMA and wrestling backgrounds if you want to go in that direction.",
  },
  {
    question: "Who are the coaches?",
    answer:
      "Our coaching staff includes experienced competitors and educators. Check the Team page for full bios.",
  },
  {
    question: "Do I need to get in shape first?",
    answer: "No. BJJ gets you in shape as a side effect of training. Just show up.",
  },
  {
    question: "How does the free trial work?",
    answer:
      "Come in 5 minutes before any class, sign the waiver, and start training for 7 days. No credit card, no pressure. Then decide if you want to join.",
  },
  {
    question: "What do I need to bring?",
    answer:
      "For your trial: a fitted t-shirt and athletic shorts with a drawstring. Optional mouthpiece. Once you join, we'll help you find the right Gi.",
  },
  {
    question: "Will I meet Joe Rogan?",
    answer: "No. But he'd tell you to come train anyway.",
  },
];
