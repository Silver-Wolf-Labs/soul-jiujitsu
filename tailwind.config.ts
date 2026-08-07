import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Attribute-scoped rather than the usual `prefers-color-scheme` or a root
  // `.dark` class. Only the member portal has a dark theme — the admin console
  // and the public site are light-only, and the kiosk has its own fixed dark
  // design that predates this. Keying the variant to an attribute the portal
  // layout owns means a `dark:` utility inside a component shared with admin
  // (CheckInsList, BeltHistoryList) is simply inert there, so the two themes
  // can't leak into each other.
  darkMode: ["selector", '[data-portal-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // ── Neutrals ──────────────────────────────────────────────────────
        white:        "#ffffff",
        black:        "#000000",
        "off-white":  "var(--color-off-white)",
        paper:        "var(--color-paper)",
        // Member-portal card surface. Only meaningful behind a `dark:` variant
        // (`bg-white dark:bg-portal-card`) — in light mode it resolves to the
        // same white the card already was. Exists because Tailwind's `white` is
        // literal hex on purpose and must stay that way; see portal-dark.css.
        "portal-card": {
          DEFAULT: "var(--color-portal-card)",
          hover:   "var(--color-portal-card-hover)",
        },
        "near-black": "var(--color-near-black)",
        ink:          "var(--color-ink)",
        muted:        "var(--color-muted)",
        line: {
          DEFAULT: "var(--color-line)",
          dark:    "var(--color-line-dark)",
        },

        // ── Yellow ────────────────────────────────────────────────────────
        yellow: {
          DEFAULT: "var(--color-yellow)",
          light:   "var(--color-yellow-light)",
          mid:     "var(--color-yellow-mid)",
          border:  "var(--color-yellow-border)",
          dark:    "var(--color-yellow-dark)",
          deep:    "var(--color-yellow-deep)",
          today:   "var(--color-yellow-today)",
        },

        // ── Blue ──────────────────────────────────────────────────────────
        blue: {
          DEFAULT:      "var(--color-blue)",
          light:        "var(--color-blue-light)",
          mid:          "var(--color-blue-mid)",
          card:         "var(--color-blue-card)",
          "card-hover": "var(--color-blue-card-hover)",
          news:         "var(--color-blue-news)",
        },

        // ── Purple ────────────────────────────────────────────────────────
        purple: {
          DEFAULT:      "var(--color-purple)",
          light:        "var(--color-purple-light)",
          card:         "var(--color-purple-card)",
          "card-hover": "var(--color-purple-card-hover)",
          badge:        "var(--color-purple-badge)",
        },

        // ── Orange (secondary action color) ───────────────────────────────
        orange: {
          DEFAULT: "var(--color-orange)",
          light:   "var(--color-orange-light)",
          mid:     "var(--color-orange-mid)",
          border:  "var(--color-orange-border)",
        },

        // ── Brown ─────────────────────────────────────────────────────────
        brown: {
          DEFAULT:      "var(--color-brown)",
          light:        "var(--color-brown-light)",
          card:         "var(--color-brown-card)",
          "card-hover": "var(--color-brown-card-hover)",
        },

        // ── Belt accent colors ─────────────────────────────────────────────
        belt: {
          white:  "var(--color-belt-white)",
          blue:   "var(--color-belt-blue)",
          purple: "var(--color-belt-purple)",
          brown:  "var(--color-belt-brown)",
          black:  "var(--color-belt-black)",
        },

        // ── Open Mat card ──────────────────────────────────────────────────
        "open-mat": {
          card:         "var(--color-open-mat-card)",
          "card-hover": "var(--color-open-mat-card-hover)",
        },

        // ── Special / seminar card ─────────────────────────────────────────
        special: {
          "card-hover": "var(--color-special-card-hover)",
        },

        // ── One-off component tokens ───────────────────────────────────────
        "blog-end":     "var(--color-blog-gradient-end)",
        "update-hover": "var(--color-update-card-hover)",

        // ── Semantic role tokens ──────────────────────────────────────────
        // These map to the 6 theme roles: primary (yellow), info (blue),
        // accent (purple), warm (brown), danger (status-error), success.
        // Components MUST use these instead of hardcoded Tailwind colors.
        danger: {
          DEFAULT:    "var(--color-status-error)",
          light:      "var(--color-status-error-light)",
          border:     "var(--color-status-error-border)",
          dark:       "var(--color-danger-dark)",
        },
        success: {
          DEFAULT:    "var(--color-status-success)",
          light:      "var(--color-status-success-light)",
          border:     "var(--color-status-success-border)",
          dark:       "var(--color-success-dark)",
        },
        // Alias for backward compat — same as danger/success above
        status: {
          success:          "var(--color-status-success)",
          "success-light":  "var(--color-status-success-light)",
          "success-border": "var(--color-status-success-border)",
          error:            "var(--color-status-error)",
          "error-light":    "var(--color-status-error-light)",
          "error-border":   "var(--color-status-error-border)",
          alert:            "var(--color-status-alert)",
          "alert-light":    "var(--color-status-alert-light)",
          "alert-border":   "var(--color-status-alert-border)",
        },
        // Neutral/disabled state
        disabled: {
          DEFAULT:    "var(--color-muted)",
          light:      "var(--color-disabled-light)",
          border:     "var(--color-line)",
        },
      },

      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        body:    ["var(--font-inter)", "sans-serif"],
        mono:    ["var(--font-dm-mono)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "4px",
        lg:      "12px",
        full:    "9999px",
      },
      letterSpacing: {
        wide:    "0.04em",
        wider:   "0.08em",
        widest:  "0.12em",
        ultra:   "0.2em",
      },
      screens: {
        nav: "900px",
      },
    },
  },
  plugins: [typography],
};

export default config;
