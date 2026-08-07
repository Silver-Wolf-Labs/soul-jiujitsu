import { describe, it, expect } from "vitest";
import { Award, Flame } from "lucide-react";
import {
  BADGE_ICONS,
  badgeIcon,
  TIER_STYLES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "../badges";

describe("badgeIcon", () => {
  it("resolves a known lucide name", () => {
    expect(badgeIcon("Flame")).toBe(Flame);
  });

  // The icon name is free text in the database so the profe can add a badge
  // without a deploy. An unknown name must degrade, not crash the portal.
  it("falls back to Award for an unknown name", () => {
    expect(badgeIcon("NotARealIconName")).toBe(Award);
  });

  it("falls back to Award for null / undefined / empty", () => {
    expect(badgeIcon(null)).toBe(Award);
    expect(badgeIcon(undefined)).toBe(Award);
    expect(badgeIcon("")).toBe(Award);
  });

  it("does not resolve inherited Object properties as icons", () => {
    // A DB row with icon = "constructor" would otherwise return Object's
    // constructor and blow up when React tried to render it.
    expect(badgeIcon("constructor")).toBe(Award);
    expect(badgeIcon("toString")).toBe(Award);
  });
});

describe("BADGE_ICONS", () => {
  it("maps every key to a defined component", () => {
    Object.entries(BADGE_ICONS).forEach(([name, Icon]) => {
      expect(Icon, `icon ${name} is undefined — bad lucide-react import`).toBeDefined();
    });
  });

  it("covers every icon seeded in the badge catalogue", () => {
    // Kept in sync with the icons in 20260808000000_gamification.sql. A badge
    // seeded with an icon outside this set renders the Award fallback, which is
    // safe but wrong-looking — this test is the reminder to extend the map.
    const SEEDED = [
      "Anchor", "Award", "CalendarCheck", "CalendarHeart", "Crown", "DoorOpen",
      "Flag", "Flame", "Footprints", "GraduationCap", "HeartHandshake", "Layers",
      "Medal", "Moon", "RefreshCw", "Shield", "Shirt", "Smile", "Sunrise",
      "Swords", "Target", "TrendingUp", "Trophy", "Unlock", "UserPlus", "Waves",
      "Zap",
    ];
    SEEDED.forEach((name) => {
      expect(BADGE_ICONS[name], `${name} missing from BADGE_ICONS`).toBeDefined();
    });
  });
});

describe("TIER_STYLES", () => {
  it("covers all four tiers", () => {
    expect(Object.keys(TIER_STYLES).sort()).toEqual(
      ["bronze", "gold", "legendary", "silver"],
    );
  });

  it("uses real hex colors, not theme custom properties", () => {
    // Tier colors are metal colors: they must stay legible under every theme,
    // so they deliberately bypass the CSS-variable theming system.
    Object.entries(TIER_STYLES).forEach(([tier, style]) => {
      expect(style.fg, `${tier} fg`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(style.bg, `${tier} bg`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(style.label.length).toBeGreaterThan(0);
    });
  });

  it("gives each tier a distinct foreground", () => {
    const fgs = Object.values(TIER_STYLES).map((s) => s.fg);
    expect(new Set(fgs).size).toBe(fgs.length);
  });
});

describe("badge categories", () => {
  it("CATEGORY_ORDER and CATEGORY_LABELS cover the same set", () => {
    expect([...CATEGORY_ORDER].sort()).toEqual(Object.keys(CATEGORY_LABELS).sort());
  });

  it("has no duplicate entries in CATEGORY_ORDER", () => {
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });
});
