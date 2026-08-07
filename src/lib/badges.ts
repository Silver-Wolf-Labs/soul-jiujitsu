import {
  Anchor,
  Award,
  CalendarCheck,
  CalendarHeart,
  Crown,
  DoorOpen,
  Flag,
  Flame,
  Footprints,
  GraduationCap,
  HeartHandshake,
  Layers,
  Medal,
  Moon,
  RefreshCw,
  Shield,
  Shirt,
  Smile,
  Sunrise,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Unlock,
  UserPlus,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { colors } from "@/lib/theme";
import type { BadgeTier, BadgeCategory } from "@/lib/supabase/types";

/**
 * Badge icons, keyed by the lucide-react name stored in `badges.icon`.
 *
 * The icon lives in the database as text so the profe can add a badge from the
 * admin UI without a migration — but lucide's full set can't be tree-shaken if
 * we look it up dynamically, so this map is the explicit allow-list. Adding a
 * badge with an icon outside this map renders the Award fallback rather than
 * crashing the portal; extend the map when you add one.
 *
 * Null-prototype so a row with icon = "constructor" or "toString" resolves to
 * the fallback instead of returning an inherited Object property that React
 * can't render.
 */
export const BADGE_ICONS: Record<string, LucideIcon> = Object.assign(Object.create(null), {
  Anchor,
  Award,
  CalendarCheck,
  CalendarHeart,
  Crown,
  DoorOpen,
  Flag,
  Flame,
  Footprints,
  GraduationCap,
  HeartHandshake,
  Layers,
  Medal,
  Moon,
  RefreshCw,
  Shield,
  Shirt,
  Smile,
  Sunrise,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Unlock,
  UserPlus,
  Waves,
  Zap,
});

/** Resolves a badge icon name to a component, falling back to Award. */
export function badgeIcon(name: string | null | undefined): LucideIcon {
  return (name && BADGE_ICONS[name]) || Award;
}

/**
 * Tier colours. Passed as inline `style` rather than Tailwind classes because
 * these are metal colours that must stay legible under every theme — see the
 * tier tokens in src/lib/theme.ts.
 */
export const TIER_STYLES: Record<BadgeTier, { fg: string; bg: string; label: string }> = {
  bronze:    { fg: colors.tierBronze,    bg: colors.tierBronzeLight,    label: "Bronce" },
  silver:    { fg: colors.tierSilver,    bg: colors.tierSilverLight,    label: "Plata" },
  gold:      { fg: colors.tierGold,      bg: colors.tierGoldLight,      label: "Oro" },
  legendary: { fg: colors.tierLegendary, bg: colors.tierLegendaryLight, label: "Legendario" },
};

/** Spanish section headings for the badge grid, in display order. */
export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  milestone:   "Hitos",
  consistency: "Constancia",
  modality:    "Estilos",
  skill:       "Técnica",
  community:   "Comunidad",
};

export const CATEGORY_ORDER: BadgeCategory[] = [
  "milestone",
  "consistency",
  "modality",
  "skill",
  "community",
];
