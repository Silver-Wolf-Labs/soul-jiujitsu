import type { AppTheme } from "./types";
import type { ThemeRoleColors } from "./roles";
import { generateSlots } from "./generate";

function makeTheme(
  id: string,
  name: string,
  description: string,
  roles: ThemeRoleColors,
  tone: "warm" | "cool" | "neutral",
): AppTheme {
  return {
    id,
    name,
    description,
    roles,
    tone,
    swatches: [roles.primary, roles.info, roles.accent, roles.warm, roles.danger, roles.success],
    slots: generateSlots(roles, tone),
  };
}

export const THEMES = new Map<string, AppTheme>([
  // ── 1. Soul (default) ───────────────────────────────────────────────────
  // Soul Jiu Jitsu brand — jungle gold, deep green, and terracotta.
  // Gold mirrors the logo lettering; green/red nod to the golden lion mark.
  ["soul", makeTheme(
    "soul",
    "Soul",
    "Oro y selva — dorado, verde y terracota",
    { primary: "#e6b323", info: "#2e7d4f", accent: "#b3402e", warm: "#a96b37", danger: "#dc2626", success: "#16a34a" },
    "warm",
  )],

  // ── 2. Journey ──────────────────────────────────────────────────────────
  // BJJ belt progression. Warm, classic, inclusive.
  ["journey", makeTheme(
    "journey",
    "Journey",
    "Belt progression — white through black",
    { primary: "#ffcd12", info: "#2e67bd", accent: "#7b37cd", warm: "#a96b37", danger: "#dc2626", success: "#16a34a" },
    "warm",
  )],

  // ── 3. Neon Cage ────────────────────────────────────────────────────────
  // Dark background + neon accents. MMA fight-night energy. Very masculine.
  ["neon-cage", makeTheme(
    "neon-cage",
    "Neon Cage",
    "Dark + neon — MMA fight-night energy",
    { primary: "#ff3e00", info: "#ff8c00", accent: "#ffe600", warm: "#ff6b35", danger: "#ff1744", success: "#00e676" },
    "cool",
  )],

  // ── 3. Blossom ──────────────────────────────────────────────────────────
  // Soft pastels, very feminine. Pink/lavender/mint — gentle and welcoming.
  ["blossom", makeTheme(
    "blossom",
    "Blossom",
    "Soft pastels — pink, lavender, and mint",
    { primary: "#f472b6", info: "#a78bfa", accent: "#67e8f9", warm: "#fbbf24", danger: "#f43f5e", success: "#34d399" },
    "warm",
  )],

  // ── 4. Iron ─────────────────────────────────────────────────────────────
  // Gunmetal, steel, and blood red. Industrial, hard, masculine.
  ["iron", makeTheme(
    "iron",
    "Iron",
    "Gunmetal and steel — raw industrial grit",
    { primary: "#e5e5e5", info: "#71717a", accent: "#a1a1aa", warm: "#92400e", danger: "#b91c1c", success: "#15803d" },
    "neutral",
  )],

  // ── 5. Rose Gold ────────────────────────────────────────────────────────
  // Modern feminine — rose gold, dusty mauve, sage. Elegant but not loud.
  ["rose-gold", makeTheme(
    "rose-gold",
    "Rose Gold",
    "Elegant warmth — rose, mauve, and sage",
    { primary: "#e8a598", info: "#b07d9e", accent: "#7c9a82", warm: "#c9956b", danger: "#c2185b", success: "#2e7d32" },
    "warm",
  )],

  // ── 6. Playzone ─────────────────────────────────────────────────────────
  // Bright, bold, fun. Kids program. Primary colors with energy.
  ["playzone", makeTheme(
    "playzone",
    "Playzone",
    "Bright and bold — for kids programs",
    { primary: "#fbbf24", info: "#3b82f6", accent: "#a855f7", warm: "#f97316", danger: "#ef4444", success: "#22c55e" },
    "warm",
  )],

  // ── 7. Arcade ───────────────────────────────────────────────────────────
  // Neon-on-dark for a younger audience. Electric purple, cyan, lime.
  ["arcade", makeTheme(
    "arcade",
    "Arcade",
    "Electric neon — fun for young athletes",
    { primary: "#a855f7", info: "#06b6d4", accent: "#84cc16", warm: "#f59e0b", danger: "#ef4444", success: "#10b981" },
    "cool",
  )],
]);

export const DEFAULT_THEME_ID = "soul";
