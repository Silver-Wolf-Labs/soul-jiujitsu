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

  it("HIGHLIGHT_BORDER_HEX values are valid hex colors", () => {
    Object.values(HIGHLIGHT_BORDER_HEX).forEach((hex) => {
      expect(hex).toMatch(/^#[0-9a-f]{3,6}$/i);
    });
  });
});
