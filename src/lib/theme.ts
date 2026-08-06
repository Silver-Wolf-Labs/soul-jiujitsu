/**
 * Central design token registry — the single source of truth for every color
 * in the project. All hex values live here and nowhere else.
 *
 * Consumers:
 *   - tailwind.config.ts  → maps tokens to Tailwind utility classes
 *   - src/lib/constants.ts → borderHex / belt color maps
 *   - src/lib/pricing-colors.ts → highlight border hex map
 *   - Components → inline `style` props when a Tailwind class won't do
 *
 * To adjust the palette: edit values here. Tailwind classes, component
 * styles, and admin previews all update automatically.
 */

export const colors = {
  // ── Neutrals ──────────────────────────────────────────────────────────────
  white:      "#ffffff",
  black:      "#000000",
  offWhite:   "#f8f7f5",
  paper:      "#f2f0ec",
  nearBlack:  "#1a1a1a",   // also aliased as ink
  ink:        "#1a1a1a",
  muted:      "#6b6b6b",
  line:       "#e0ddd8",
  lineDark:   "#c8c4bc",

  // ── Yellow family ─────────────────────────────────────────────────────────
  yellow:        "#ffcd12",   // primary brand accent
  yellowLight:   "#fdf6d8",   // very light tint — badge / card backgrounds
  yellowMid:     "#f5d55c",   // medium — legend dots, highlights
  yellowBorder:  "#f0d87a",   // tag / badge borders
  yellowDark:    "#8a6a00",   // event-tag text (dark amber)
  yellowDeep:    "#7a5a00",   // blog / guest-tag text (slightly deeper)
  yellowToday:   "#fffbe6",   // today-card background tint

  // ── Blue family ───────────────────────────────────────────────────────────
  blue:           "#2e67bd",   // main brand blue / belt blue
  blueLight:      "#e8eef8",   // light bg tint
  blueMid:        "#3570c8",   // interactive text / focus rings
  blueCard:       "#dce7f5",   // Gi class card background
  blueCardHover:  "#ccd9f0",   // Gi class card hover
  blueNews:       "#c0ceea",   // "News" update-tag border

  // ── Purple family ─────────────────────────────────────────────────────────
  purple:           "#7b37cd",   // No-Gi / belt purple
  purpleLight:      "#f0ebf8",   // light bg tint
  purpleCard:       "#e8d8f8",   // No-Gi class card background
  purpleCardHover:  "#dbc8f2",   // No-Gi class card hover
  purpleBadge:      "#d0b8f0",   // team-role badge border

  // ── Brown family ──────────────────────────────────────────────────────────
  brown:           "#a96b37",   // Youth / belt brown
  brownLight:      "#f5ede4",   // light bg tint
  brownCard:       "#edd8c5",   // Youth class card background
  brownCardHover:  "#e4c9b0",   // Youth class card hover

  // ── Orange family (secondary action color) ────────────────────────────────
  orange:        "#e8742a",   // secondary CTA — energetic, complements yellow
  orangeLight:   "#fef4ed",   // very light tint for button/badge backgrounds
  orangeMid:     "#d4661e",   // slightly darker for hover / active states
  orangeBorder:  "#f5c4a0",   // soft border for orange-tinted elements

  // ── Open-mat card (neutral gray surface) ──────────────────────────────────
  openMatCard:       "#e8e6e2",
  openMatCardHover:  "#dedad4",

  // ── Special/seminar card ──────────────────────────────────────────────────
  specialCardHover:  "#faedb8",

  // ── Belt accent colors (BeltDivider, Jumbotron sidebar, team avatars) ─────
  beltWhite:   "#ffffff",
  beltBlue:    "#2e67bd",
  beltPurple:  "#7b37cd",
  beltBrown:   "#a96b37",
  beltBlack:   "#2a2a2a",

  // ── Belt SVG rendering tokens (body / tip / border shades) ────────────────
  beltBodyWhite:    "#EEEEEE",
  beltBodyBlue:     "#1D4E8F",
  beltBodyPurple:   "#6B3FA0",
  beltBodyBrown:    "#7A4218",
  beltBodyBlack:    "#1A1A1A",

  beltTipWhite:     "#111111",
  beltTipBlue:      "#0D0D0D",
  beltTipPurple:    "#0D0D0D",
  beltTipBrown:     "#0D0D0D",
  beltTipBlack:     "#8B0000",

  beltBorderWhite:  "#C8C8C8",
  beltBorderBlue:   "#123870",
  beltBorderPurple: "#4A2B78",
  beltBorderBrown:  "#5C2F0E",
  beltBorderBlack:  "#000000",

  // ── Miscellaneous component tokens ────────────────────────────────────────
  blogGradientEnd:  "#2a1a08",   // dark end of featured-post gradient
  updateCardHover:  "#fafaf9",   // update-feed card hover (near off-white)
} as const;

export type ColorKey = keyof typeof colors;
