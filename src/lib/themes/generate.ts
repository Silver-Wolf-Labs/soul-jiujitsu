import type { ThemeColorSlots } from "./types";
import type { ThemeRoleColors } from "./roles";

type NeutralTone = "warm" | "cool" | "neutral";

// ── Color conversion helpers ────────────────────────────────────────────────

/** Parse a hex color (#rrggbb or #rgb) to HSL [h 0-360, s 0-100, l 0-100] */
function hexToHsl(hex: string): [number, number, number] {
  // Normalize hex
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }

  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic
    return [0, 0, l * 100];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let hue: number;
  switch (max) {
    case r:
      hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      hue = ((b - r) / d + 2) / 6;
      break;
    default:
      hue = ((r - g) / d + 4) / 6;
      break;
  }

  return [hue * 360, s * 100, l * 100];
}

/** Convert HSL [h 0-360, s 0-100, l 0-100] to hex (#rrggbb) */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;

  if (sNorm === 0) {
    const v = Math.round(lNorm * 255);
    return `#${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}`;
  }

  const hNorm = ((h % 360) + 360) % 360 / 360;

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = lNorm < 0.5
    ? lNorm * (1 + sNorm)
    : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hNorm) * 255);
  const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Generate a shade from a base hex color by scaling its saturation and
 * setting an explicit lightness. The hue is preserved.
 *
 * @param hex       Base color in hex
 * @param satMult   Multiplier for the base saturation (0-1 scale it down, >1 scale up)
 * @param lightness Target lightness (0-100)
 */
function shade(hex: string, satMult: number, lightness: number): string {
  const [h, s] = hexToHsl(hex);
  // Clamp saturation to [0, 100]
  const newSat = Math.min(100, Math.max(0, s * satMult));
  // Clamp lightness to [0, 100]
  const newLight = Math.min(100, Math.max(0, lightness));
  return hslToHex(h, newSat, newLight);
}

/**
 * Like shade() but shifts the hue by a given amount of degrees.
 */
function shadeShift(hex: string, hueDelta: number, satMult: number, lightness: number): string {
  const [h, s] = hexToHsl(hex);
  const newHue = ((h + hueDelta) % 360 + 360) % 360;
  const newSat = Math.min(100, Math.max(0, s * satMult));
  const newLight = Math.min(100, Math.max(0, lightness));
  return hslToHex(newHue, newSat, newLight);
}

// ── WCAG contrast helpers ────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(...hexToRgb(hex1));
  const l2 = relativeLuminance(...hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Darken a color (preserving hue and saturation) until it achieves at least
 * `minRatio` contrast against white. Returns the original color if it already
 * passes. Used for text-on-white slots.
 */
function ensureTextContrast(hex: string, minRatio = 4.5): string {
  if (contrastRatio(hex, "#ffffff") >= minRatio) return hex;
  const [h, s, l] = hexToHsl(hex);
  // Walk lightness down by 1% steps until we hit the target
  for (let newL = Math.floor(l); newL >= 0; newL--) {
    const candidate = hslToHex(h, s, newL);
    if (contrastRatio(candidate, "#ffffff") >= minRatio) return candidate;
  }
  // If pure saturation doesn't help (very unlikely), boost saturation too
  for (let newL = 30; newL >= 0; newL--) {
    const candidate = hslToHex(h, Math.min(100, s * 1.3), newL);
    if (contrastRatio(candidate, "#ffffff") >= minRatio) return candidate;
  }
  return "#1a1a1a"; // absolute fallback
}


// ── Neutral palette sets ────────────────────────────────────────────────────

const WARM_NEUTRALS = {
  offWhite: "#f8f7f5",
  paper: "#f2f0ec",
  nearBlack: "#1a1a1a",
  ink: "#1a1a1a",
  muted: "#6b6b6b",
  line: "#e0ddd8",
  lineDark: "#c8c4bc",
  openMatCard: "#e8e6e2",
  openMatCardHover: "#dedad4",
};

const COOL_NEUTRALS = {
  offWhite: "#f1f5f9",
  paper: "#e2e8f0",
  nearBlack: "#0f172a",
  ink: "#1e293b",
  muted: "#64748b",
  line: "#cbd5e1",
  lineDark: "#94a3b8",
  openMatCard: "#e2e8f0",
  openMatCardHover: "#cbd5e1",
};

const PURE_NEUTRALS = {
  offWhite: "#f5f5f5",
  paper: "#e5e5e5",
  nearBlack: "#171717",
  ink: "#1a1a1a",
  muted: "#737373",
  line: "#d4d4d4",
  lineDark: "#a3a3a3",
  openMatCard: "#e5e5e5",
  openMatCardHover: "#d4d4d4",
};

// ── Slot generator ──────────────────────────────────────────────────────────

export function generateSlots(
  roles: ThemeRoleColors,
  tone: NeutralTone = "warm",
): ThemeColorSlots {
  const n =
    tone === "warm"
      ? WARM_NEUTRALS
      : tone === "cool"
        ? COOL_NEUTRALS
        : PURE_NEUTRALS;

  // ── Pre-compute contrast-safe text colors ─────────────────────────────
  // These ensure AA (4.5:1) contrast on white for any theme palette.
  // Light/pastel themes get auto-darkened text; darker themes pass through.
  const safeInfo   = ensureTextContrast(roles.info);
  const safeAccent = ensureTextContrast(roles.accent);
  const safeWarm   = ensureTextContrast(roles.warm);
  const safeDanger = ensureTextContrast(roles.danger, 3.5);  // AA-large is fine for status
  const safeSuccess = ensureTextContrast(roles.success, 3.5);

  // Card backgrounds
  const infoCard   = shade(roles.info, 0.92, 91);
  const accentCard = shade(roles.accent, 0.7, 91);
  const warmCard   = shade(roles.warm, 0.55, 88);
  const dangerLight = shade(roles.danger, 0.65, 96);
  const successLight = shade(roles.success, 0.75, 96);

  return {
    // ── Neutrals ──────────────────────────────────────────────────────────
    offWhite: n.offWhite,
    paper: n.paper,
    nearBlack: n.nearBlack,
    ink: n.ink,
    muted: n.muted,
    line: n.line,
    lineDark: n.lineDark,

    // ── Primary family (mapped from "yellow" slots) ───────────────────────
    yellow: roles.primary,
    yellowLight: shade(roles.primary, 0.9, 92),
    yellowMid: shade(roles.primary, 0.88, 66),
    yellowBorder: shade(roles.primary, 0.8, 71),
    yellowDark: shade(roles.primary, 1.0, 27),
    yellowDeep: shade(roles.primary, 1.0, 24),
    yellowToday: shade(roles.primary, 1.0, 95),

    // ── Info family (mapped from "blue" slots) ────────────────────────────
    // `blue` is contrast-safe for use as text on white backgrounds
    blue: safeInfo,
    blueLight: shade(roles.info, 0.87, 94),
    blueMid: shade(roles.info, 0.95, 50),
    blueCard: infoCard,
    blueCardHover: shade(roles.info, 0.85, 87),
    blueNews: shade(roles.info, 0.75, 82),

    // ── Accent family (mapped from "purple" slots) ────────────────────────
    // `purple` is contrast-safe for use as text on white backgrounds
    purple: safeAccent,
    purpleLight: shade(roles.accent, 0.65, 94),
    purpleCard: accentCard,
    purpleCardHover: shade(roles.accent, 0.65, 87),
    purpleBadge: shade(roles.accent, 0.55, 80),

    // ── Orange family (derived from primary, hue-shifted toward orange) ───
    orange: shadeShift(roles.primary, -24, 0.82, 54),
    orangeLight: shadeShift(roles.primary, -24, 0.5, 97),
    orangeMid: shadeShift(roles.primary, -24, 0.82, 47),
    orangeBorder: shadeShift(roles.primary, -24, 0.6, 80),

    // ── Warm family (mapped from "brown" slots) ───────────────────────────
    // `brown` is contrast-safe for use as text on white backgrounds
    brown: safeWarm,
    brownLight: shade(roles.warm, 0.5, 93),
    brownCard: warmCard,
    brownCardHover: shade(roles.warm, 0.55, 83),

    // ── Belt accents (fixed — represent real belt colors) ─────────────────
    beltWhite: "#ffffff",
    beltBlue: "#2e67bd",
    beltPurple: "#7b37cd",
    beltBrown: "#a96b37",
    beltBlack: "#2a2a2a",

    // ── Surfaces ──────────────────────────────────────────────────────────
    openMatCard: n.openMatCard,
    openMatCardHover: n.openMatCardHover,
    specialCardHover: shade(roles.primary, 0.7, 82),

    // ── Component tokens ──────────────────────────────────────────────────
    blogGradientEnd: n.nearBlack,
    updateCardHover: n.offWhite,

    // ── Status tokens ─────────────────────────────────────────────────────
    statusSuccess: safeSuccess,
    statusSuccessLight: successLight,
    statusSuccessBorder: shade(roles.success, 0.6, 82),
    statusError: safeDanger,
    statusErrorLight: dangerLight,
    statusErrorBorder: shade(roles.danger, 0.6, 82),
    statusAlert: roles.primary,
    statusAlertLight: shade(roles.primary, 0.9, 92),
    statusAlertBorder: shade(roles.primary, 0.8, 71),

    // ── Extra semantic shades ─────────────────────────────────────────
    dangerDark: shade(roles.danger, 0.9, 30),
    successDark: shade(roles.success, 0.9, 30),
    disabledLight: tone === "warm" ? "#f5f5f0" : tone === "cool" ? "#f1f5f9" : "#f5f5f5",
  };
}
