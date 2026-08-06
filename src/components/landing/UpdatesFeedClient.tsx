"use client";

import { useState, useEffect, useRef } from "react";
import { UPDATE_TAG_CONFIG, UpdateType } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import Tag from "@/components/ui/Tag";
import { InlineMd } from "@/components/ui/InlineMd";
import type { Update } from "@/lib/supabase/types";

interface Props {
  updates: Update[];
  interval: number;
}

function UpdateCard({ u }: { u: Update }) {
  const tagCfg = UPDATE_TAG_CONFIG[u.type as UpdateType] ?? UPDATE_TAG_CONFIG[UpdateType.News];
  return (
    <div className="bg-white p-7 hover:bg-update-hover transition-colors duration-150 cursor-pointer h-full">
      <Tag className={`mb-3.5 ${tagCfg.className}`}>{tagCfg.label}</Tag>
      <div className="text-[11px] text-muted font-mono mb-2">{formatDate(u.date)}</div>
      <div className="text-[17px] font-semibold text-ink mb-2 leading-snug">{u.title}</div>
      <div className="text-[14px] text-muted leading-relaxed">
        <InlineMd text={u.body} />
      </div>
    </div>
  );
}

export default function UpdatesFeedClient({ updates, interval }: Props) {
  const [startIdx, setStartIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const mobileScrollRef = useRef<HTMLDivElement>(null);

  function scrollToCenter(item: HTMLElement) {
    const container = mobileScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    container.scrollTo({
      left: item.offsetLeft - (container.offsetWidth - item.offsetWidth) / 2,
      behavior: "smooth",
    });
  }

  function scrollToIndex(index: number) {
    const container = mobileScrollRef.current;
    if (!container) return;
    const items = container.querySelectorAll("[data-update-card]");
    const item = items[index] as HTMLElement;
    if (!item) return;
    container.scrollTo({
      left: item.offsetLeft - (container.offsetWidth - item.offsetWidth) / 2,
      behavior: "smooth",
    });
  }

  function handleMobileScroll() {
    const container = mobileScrollRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll("[data-update-card]"));
    const center = container.scrollLeft + container.offsetWidth / 2;
    let closest = 0;
    let minDist = Infinity;
    items.forEach((el, i) => {
      const h = el as HTMLElement;
      const dist = Math.abs(h.offsetLeft + h.offsetWidth / 2 - center);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setActiveIndex(closest);
  }

  const PAGE_SIZE = 3;
  const total = updates.length;

  // Auto-rotate on desktop only (no-op on mobile since CardScroller handles scrolling)
  useEffect(() => {
    if (total <= PAGE_SIZE) return;
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setStartIdx((i) => (i + 1) % total);
        setFading(false);
      }, 500);
    }, interval * 1000);
    return () => clearInterval(t);
  }, [total, interval]);

  // Desktop: windowed 3-up view with auto-rotation
  const visible = Array.from({ length: Math.min(PAGE_SIZE, total) }, (_, i) =>
    updates[(startIdx + i) % total]
  );

  return (
    <>
      {/* Mobile: snap carousel showing all updates */}
      <div
        ref={mobileScrollRef}
        onScroll={handleMobileScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4 pb-4 -mx-5 px-5 nav:hidden"
      >
        {updates.map((u) => (
          <div
            key={u.id}
            data-update-card
            className="flex-shrink-0 snap-center w-[70vw] bg-white border border-line rounded-lg overflow-hidden"
            onClick={(e) => scrollToCenter(e.currentTarget)}
          >
            <UpdateCard u={u} />
          </div>
        ))}
      </div>
      {/* Dot indicators — matches CardScroller pattern */}
      {updates.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3 nav:hidden">
          {updates.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === activeIndex
                  ? "w-5 bg-black"
                  : "w-1.5 bg-black/20 hover:bg-black/40"
              }`}
              aria-label={`Go to card ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Desktop: 3-column grid with auto-rotation */}
      <div
        className="hidden nav:grid nav:grid-cols-3 gap-px bg-line border border-line rounded-lg overflow-hidden"
        style={{ transition: "opacity 0.5s ease", opacity: fading ? 0 : 1 }}
      >
        {visible.map((u) => (
          <UpdateCard key={u.id} u={u} />
        ))}
      </div>
    </>
  );
}
