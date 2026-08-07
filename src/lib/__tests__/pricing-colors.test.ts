import { describe, it, expect } from "vitest";
import {
  HIGHLIGHT_COLOR_KEYS,
  HIGHLIGHT_BG_CLASS,
  HIGHLIGHT_TEXT_COLOR,
  HIGHLIGHT_BORDER_HEX,
} from "../pricing-colors";

describe("pricing highlight color maps", () => {
  it("all three maps cover every declared color key", () => {
    HIGHLIGHT_COLOR_KEYS.forEach((key) => {
      expect(HIGHLIGHT_BG_CLASS[key], `HIGHLIGHT_BG_CLASS missing "${key}"`).toBeDefined();
      expect(HIGHLIGHT_TEXT_COLOR[key], `HIGHLIGHT_TEXT_COLOR missing "${key}"`).toBeDefined();
      expect(HIGHLIGHT_BORDER_HEX[key], `HIGHLIGHT_BORDER_HEX missing "${key}"`).toBeDefined();
    });
  });

  it("HIGHLIGHT_BG_CLASS values are complete static class names (no interpolation)", () => {
    // Regression: bg-${color} dynamic interpolation breaks Tailwind static extraction.
    // All values must be fully-spelled-out class strings.
    Object.values(HIGHLIGHT_BG_CLASS).forEach((cls) => {
      expect(cls).toMatch(/^bg-[a-z-]+$/);
      expect(cls).not.toContain("$");
      expect(cls).not.toContain("{");
    });
  });

  it("HIGHLIGHT_TEXT_COLOR values are complete static class names", () => {
    Object.values(HIGHLIGHT_TEXT_COLOR).forEach((cls) => {
      expect(cls).toMatch(/^text-[a-z-]+$/);
    });
  });

  it("HIGHLIGHT_BORDER_HEX values are theme-responsive CSS var references", () => {
    // These used to be literal hex. They were deliberately moved to CSS custom
    // properties so a border follows the active theme instead of staying frozen
    // at the default palette's value — assert the var() form, because a literal
    // hex sneaking back in is the actual regression now.
    Object.values(HIGHLIGHT_BORDER_HEX).forEach((value) => {
      expect(value).toMatch(/^var\(--color-[a-z-]+\)$/);
    });
  });
});
