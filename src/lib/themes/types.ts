import type { ThemeRoleColors } from "./roles";

export type { ThemeRoleColors };

export interface ThemeColorSlots {
  // ── Neutrals ──────────────────────────────────────────────────────────────
  offWhite:          string;
  paper:             string;
  nearBlack:         string;
  ink:               string;
  muted:             string;
  line:              string;
  lineDark:          string;

  // ── Yellow family ─────────────────────────────────────────────────────────
  yellow:            string;
  yellowLight:       string;
  yellowMid:         string;
  yellowBorder:      string;
  yellowDark:        string;
  yellowDeep:        string;
  yellowToday:       string;

  // ── Blue family ───────────────────────────────────────────────────────────
  blue:              string;
  blueLight:         string;
  blueMid:           string;
  blueCard:          string;
  blueCardHover:     string;
  blueNews:          string;

  // ── Purple family ─────────────────────────────────────────────────────────
  purple:            string;
  purpleLight:       string;
  purpleCard:        string;
  purpleCardHover:   string;
  purpleBadge:       string;

  // ── Orange family (secondary action color) ────────────────────────────────
  orange:            string;
  orangeLight:       string;
  orangeMid:         string;
  orangeBorder:      string;

  // ── Brown family ──────────────────────────────────────────────────────────
  brown:             string;
  brownLight:        string;
  brownCard:         string;
  brownCardHover:    string;

  // ── Belt accent colors ────────────────────────────────────────────────────
  beltWhite:         string;
  beltBlue:          string;
  beltPurple:        string;
  beltBrown:         string;
  beltBlack:         string;

  // ── Surface tokens ────────────────────────────────────────────────────────
  openMatCard:       string;
  openMatCardHover:  string;
  specialCardHover:  string;

  // ── Component tokens ─────────────────────────────────────────────────────
  blogGradientEnd:   string;
  updateCardHover:   string;

  // ── Status / semantic tokens ──────────────────────────────────────────────
  statusSuccess:        string;
  statusSuccessLight:   string;
  statusSuccessBorder:  string;
  statusError:          string;
  statusErrorLight:     string;
  statusErrorBorder:    string;
  statusAlert:          string;
  statusAlertLight:     string;
  statusAlertBorder:    string;

  // ── Extra semantic shades (used by Tailwind danger/success/disabled) ─────
  dangerDark:           string;
  successDark:          string;
  disabledLight:        string;
}

export interface AppTheme {
  id:          string;
  name:        string;
  description: string;
  /** 6 role colors in order: primary, info, accent, warm, danger, success */
  swatches:    string[];
  roles:       ThemeRoleColors;
  tone:        "warm" | "cool" | "neutral";
  slots:       ThemeColorSlots;
}
