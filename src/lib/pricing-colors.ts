/**
 * Safe static Tailwind class lookup maps for pricing plan highlight colors.
 *
 * IMPORTANT: Do NOT use dynamic interpolation (e.g. `bg-${color}`) with these
 * values — Tailwind's static extractor cannot detect dynamically constructed
 * class names. All classes must appear as complete strings in source.
 *
 * Border hex values use CSS vars so they respond to theme changes.
 */

export const HIGHLIGHT_COLOR_KEYS = ["black", "blue", "purple", "brown", "yellow"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLOR_KEYS)[number];

/** Background class for the highlight badge pill. */
export const HIGHLIGHT_BG_CLASS: Record<string, string> = {
  black:  "bg-black",
  blue:   "bg-blue",
  purple: "bg-purple",
  brown:  "bg-brown",
  yellow: "bg-yellow",
};

/** Text color class paired with each highlight background. */
export const HIGHLIGHT_TEXT_COLOR: Record<string, string> = {
  black:  "text-white",
  blue:   "text-white",
  purple: "text-white",
  brown:  "text-white",
  yellow: "text-black",
};

/** Human-readable label for each highlight color (role-based, not raw color name). */
export const HIGHLIGHT_LABEL: Record<string, string> = {
  black:  "Dark",
  blue:   "Info",
  purple: "Accent",
  brown:  "Warm",
  yellow: "Primary",
};

/** CSS var references used for inline border styles (theme-responsive). */
export const HIGHLIGHT_BORDER_HEX: Record<string, string> = {
  black:  "var(--color-near-black)",
  blue:   "var(--color-blue)",
  purple: "var(--color-purple)",
  brown:  "var(--color-brown)",
  yellow: "var(--color-yellow)",
};
