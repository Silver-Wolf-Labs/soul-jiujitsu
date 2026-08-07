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
    label: "Kids",
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
    label: "Especial",
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
    label: "⚠ Aviso",
    className: "bg-danger-light text-danger border border-danger-border",
  },
  [UpdateType.Event]: {
    label: "★ Evento",
    className: "bg-yellow-light text-yellow-dark border border-yellow-border",
  },
  [UpdateType.Class]: {
    label: "+ Nueva clase",
    className: "bg-success-light text-success border border-success-border",
  },
  [UpdateType.News]: {
    label: "Noticia",
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
    label: "Fundador",
    className: "bg-brown-light text-brown border border-brown",
  },
  [TeamMemberType.HeadCoach]: {
    label: "Profesor principal",
    className: "bg-purple-light text-purple border border-purple-badge",
  },
  [TeamMemberType.Instructor]: {
    label: "Profesor",
    className: "bg-purple-light text-purple border border-purple-badge",
  },
  [TeamMemberType.Guest]: {
    label: "Invitado",
    className: "bg-yellow-light text-yellow-deep border border-yellow-border",
  },
};

// ── Nav links ──────────────────────────────────────────────────────────────

export const NAV_LINKS = [
  { label: "Nosotros", href: "/#mission" },
  { label: "Horarios", href: "/#schedule" },
  { label: "Reglas", href: "/#rules" },
  { label: "Planes", href: "/#pricing" },
  { label: "Equipo", href: "/#team" },
  { label: "Contacto", href: "/#contact" },
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
    question: "¿Qué es el jiu jitsu brasileño?",
    answer:
      "Un arte marcial de agarre basado en el control, la palanca y las sumisiones — estrangulaciones y luxaciones articulares. No hay golpes: se trata de técnica sobre fuerza, por eso cualquier persona puede practicarlo sin importar tamaño o edad.",
  },
  {
    question: "¿Necesito estar en forma para empezar?",
    answer:
      "No. El jiu jitsu te pone en forma como efecto secundario de entrenar. Solo tienes que presentarte — el resto llega solo.",
  },
  {
    question: "¿Cómo es mi primera clase?",
    answer:
      "Llega con anticipación, preséntate con el profesor y entrena a tu ritmo. Trae ropa deportiva cómoda y una botella de agua. Nadie te va a exigir más de lo que puedes dar el primer día.",
  },
  {
    question: "¿Qué debo llevar?",
    answer:
      "Para No-Gi: rashguard o camiseta ajustada y short sin bolsillos ni cierres. Para Gi: kimono (si aún no tienes, te ayudamos a conseguir el tuyo). Sandalias para fuera del mat y uñas cortas — es parte de las reglas.",
  },
  {
    question: "¿Es un espacio seguro para mujeres?",
    answer:
      "Sí, y es parte central de nuestra misión: un ambiente 100% seguro, inclusivo y respetuoso, donde las mujeres se sientan protegidas, valoradas y empoderadas.",
  },
  {
    question: "¿Tienen clases para niños?",
    answer:
      "Sí. Las clases kids son los lunes a las 5:00 p.m. y los sábados a las 9:30 a.m. Formamos disciplina, respeto y confianza desde pequeños.",
  },
  {
    question: "¿Dan clases privadas?",
    answer:
      "Sí. Consulta los horarios disponibles directamente con el profesor o escríbenos por el formulario de contacto.",
  },
];
