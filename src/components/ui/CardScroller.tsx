"use client";

import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from "react";

interface Props {
  children: React.ReactNode;
  cols: 3 | 4;
  gap?: string;
  className?: string;
  /** Index of the card to scroll into view on mount. */
  defaultIndex?: number;
  /**
   * When true the carousel never switches to a CSS grid — it stays
   * horizontally scrollable at every viewport width.
   */
  alwaysCarousel?: boolean;
}

const COL_CLASSES: Record<3 | 4, string> = {
  3: "nav:grid-cols-3",
  4: "nav:grid-cols-4",
};

/**
 * Responsive card carousel / grid component.
 *
 * Mobile: horizontal snap-scroll carousel with peek, dot indicators,
 *   and gradient fade hints on edges.
 * Desktop (nav+): CSS grid by default; stays carousel when alwaysCarousel=true.
 *   Carousel mode shows left/right arrow buttons.
 */
export default function CardScroller({
  children,
  cols,
  gap = "gap-4",
  className = "",
  defaultIndex,
  alwaysCarousel = false,
}: Props) {
  const colClass = COL_CLASSES[cols];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(defaultIndex ?? 0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isCarousel, setIsCarousel] = useState(true);
  const childCount = React.Children.count(children);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const scrollable = el.scrollWidth > el.clientWidth + 2;
    setIsCarousel(scrollable);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);

    // Determine active index from scroll position
    const items = Array.from(el.children) as HTMLElement[];
    const center = el.scrollLeft + el.clientWidth / 2;
    let closest = 0;
    let minDist = Infinity;
    items.forEach((item, i) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const dist = Math.abs(center - itemCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setActiveIndex(closest);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    updateScrollState();
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState]);

  useLayoutEffect(() => {
    if (defaultIndex == null || !scrollerRef.current) return;
    const container = scrollerRef.current;
    const item = container.children[defaultIndex] as HTMLElement | undefined;
    if (!item) return;
    container.scrollLeft =
      item.offsetLeft - (container.offsetWidth - item.offsetWidth) / 2;
  }, [defaultIndex]);

  function scrollToIndex(index: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const item = el.children[index] as HTMLElement | undefined;
    if (!item) return;
    el.scrollTo({
      left: item.offsetLeft - (el.offsetWidth - item.offsetWidth) / 2,
      behavior: "smooth",
    });
  }

  function scrollByDirection(dir: "left" | "right") {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  }

  const carouselClasses = alwaysCarousel
    ? `flex overflow-x-auto snap-x snap-mandatory scrollbar-hide ${gap} pb-2 -mx-5 px-5 [scroll-padding-inline:1.25rem]`
    : `flex overflow-x-auto snap-x snap-mandatory scrollbar-hide ${gap} pb-2 -mx-5 px-5 [scroll-padding-inline:1.25rem] nav:mx-0 nav:px-0 nav:[scroll-padding-inline:0] nav:overflow-visible nav:grid ${colClass} nav:pb-0`;

  const itemClasses = alwaysCarousel
    ? "flex-shrink-0 snap-center w-[72vw] sm:w-[43vw] md:w-[31vw] lg:w-[23vw] xl:w-[21vw] pt-5"
    : "flex-shrink-0 snap-center w-[72vw] pt-5 nav:pt-0 nav:w-auto";

  return (
    <div className={`relative ${className}`}>
      {/* Carousel container */}
      <div ref={scrollerRef} className={carouselClasses}>
        {React.Children.map(children, (child, i) => (
          <div
            className={itemClasses}
            onClick={() => {
              const el = scrollerRef.current;
              if (el && el.scrollWidth > el.clientWidth) scrollToIndex(i);
            }}
          >
            {child}
          </div>
        ))}
      </div>

      {/* Desktop arrow buttons (only when scrollable) */}
      {isCarousel && canScrollLeft && (
        <button
          onClick={() => scrollByDirection("left")}
          className="hidden nav:flex absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-white border border-line shadow-md hover:shadow-lg hover:border-black/20 transition-all"
          aria-label="Scroll left"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      )}
      {isCarousel && canScrollRight && (
        <button
          onClick={() => scrollByDirection("right")}
          className="hidden nav:flex absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-white border border-line shadow-md hover:shadow-lg hover:border-black/20 transition-all"
          aria-label="Scroll right"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      )}

      {/* Dot indicators (mobile only, when carousel active) */}
      {isCarousel && childCount > 1 && (
        <div className="flex justify-center gap-1.5 mt-3 nav:hidden">
          {Array.from({ length: childCount }, (_, i) => (
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
    </div>
  );
}
