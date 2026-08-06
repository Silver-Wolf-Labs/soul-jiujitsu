"use client";

import { useState, useEffect } from "react";
import { InlineMd } from "@/components/ui/InlineMd";
import type { Banner } from "@/lib/supabase/types";

const COLOR_MAP: Record<string, { bar: string; dot: string }> = {
  black:  { bar: "bg-black text-white",   dot: "bg-yellow" },
  blue:   { bar: "bg-blue text-white",    dot: "bg-yellow" },
  purple: { bar: "bg-purple text-white",  dot: "bg-yellow" },
  brown:  { bar: "bg-brown text-white",   dot: "bg-yellow" },
  yellow: { bar: "bg-yellow text-black",  dot: "bg-black"  },
};

interface Props {
  banners: Banner[];
  interval: number; // seconds
}

export default function AlertBannerClient({ banners, interval }: Props) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [tick, setTick] = useState(0);
  const [fading, setFading] = useState(false);

  // Restore dismissed IDs from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("dismissed-banners");
      if (raw) setDismissed(new Set(JSON.parse(raw) as number[]));
    } catch { /* noop */ }
  }, []);

  const visible = banners.filter((b) => !dismissed.has(b.id));

  // Rotate ticker with fade transition
  useEffect(() => {
    if (visible.length <= 1) return;
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setTick((n) => n + 1);
        setFading(false);
      }, 400);
    }, interval * 1000);
    return () => clearInterval(t);
  }, [visible.length, interval]);

  if (!visible.length) return null;

  const current = visible[tick % visible.length];
  const colors = COLOR_MAP[current.color] ?? COLOR_MAP.black;
  const isExpanded = current.expanded;

  function dismiss() {
    const nextArr = Array.from(dismissed).concat(current.id);
    const next = new Set(nextArr);
    setDismissed(next);
    try {
      sessionStorage.setItem("dismissed-banners", JSON.stringify(nextArr));
    } catch { /* noop */ }
  }

  return (
    <div
      className={`${colors.bar} flex items-center justify-center relative transition-colors duration-700 ${
        isExpanded ? "py-4 min-h-[60px]" : "py-2.5 min-h-[44px]"
      }`}
    >
      {/* Inner content — hugs text, centered as a group */}
      <div className="flex items-center gap-3 text-[13px] font-medium tracking-[0.02em] max-w-6xl px-4 nav:px-10">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot} animate-pulse-dot`} />

        <span
          key={`${current.id}-${tick}`}
          style={{ transition: "opacity 0.4s ease", opacity: fading ? 0 : 1 }}
        >
          <InlineMd text={current.text} />
        </span>

        {visible.length > 1 && (
          <span className="opacity-40 text-xs tabular-nums flex-shrink-0">
            {(tick % visible.length) + 1}/{visible.length}
          </span>
        )}

        <button
          onClick={dismiss}
          className="opacity-50 hover:opacity-100 bg-transparent border-none text-lg cursor-pointer leading-none flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
}
