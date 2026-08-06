/**
 * Shared SVG icon components.
 *
 * All icons use a 24x24 viewBox, stroke-based, inheriting `currentColor`.
 * Size is controlled via the `size` prop (px) — defaults to 16.
 */

import React from "react";

interface IconProps {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}

const defaults: Required<Pick<IconProps, "size" | "aria-hidden">> = {
  size: 16,
  "aria-hidden": true,
};

function svgProps({ size = defaults.size, className, "aria-hidden": ariaHidden = defaults["aria-hidden"] }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": ariaHidden,
  };
}

// ── Navigation chevrons ───────────────────────────────────────────────────

export function ChevronLeft(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function ChevronUp(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ── Directional arrows ────────────────────────────────────────────────────

export function ArrowLeft(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  );
}

// ── External link indicator ───────────────────────────────────────────────

export function ExternalLink(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// ── Collapse / expand ─────────────────────────────────────────────────────

export function ChevronsUp(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M17 11l-5-5-5 5" />
      <path d="M17 18l-5-5-5 5" />
    </svg>
  );
}
