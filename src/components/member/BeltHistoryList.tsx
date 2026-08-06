"use client";

import type { BeltHistory } from "@/lib/supabase/types";
import { BeltColor, BELT_DOT_CLASS, BELT_TEXT_CLASS, STRIPE_MAX } from "@/lib/constants";
import { labelForEvent } from "@/lib/belt-events";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { usePagination } from "@/lib/hooks/use-pagination";
import Pager from "@/components/ui/Pager";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string, tz?: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: tz,
    });
  } catch {
    return iso;
  }
}

function StripePips({ count, belt }: { count: number; belt: BeltHistory["belt"] }) {
  const max = STRIPE_MAX[belt as BeltColor] ?? 4;
  return (
    <div className="flex gap-1 items-center mt-1">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-full border ${
            i < count
              ? "bg-current border-current"
              : "bg-transparent border-muted/30"
          }`}
        />
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface BeltHistoryListProps {
  entries: BeltHistory[];
  /** Items per page on desktop (≥ 641 px). Default: 5. */
  pageSize?: number;
  /** Items per page on mobile (≤ 640 px). Default: 3. */
  mobilePageSize?: number;
  /**
   * IANA timezone identifier for date display, e.g. "America/Chicago".
   * Falls back to the viewer's browser timezone when omitted.
   */
  timezone?: string;
  /** Shown when the list is empty. */
  emptyText?: string;
  className?: string;
}

/**
 * Paginated belt-history timeline.
 *
 * Pure display — parents own data fetching and mutations.
 * Page is clamped (not reset) when entries change to preserve browsing position.
 */
export default function BeltHistoryList({
  entries,
  pageSize = 5,
  mobilePageSize = 3,
  timezone,
  emptyText = "No belt history yet.",
  className = "",
}: BeltHistoryListProps) {
  const isMobile = useIsMobile();
  const effectivePageSize = isMobile ? mobilePageSize : pageSize;
  const { visible, page, setPage, totalPages } = usePagination(entries, effectivePageSize);

  if (entries.length === 0) {
    return (
      <div className={`text-sm text-muted py-6 text-center ${className}`}>
        {emptyText}
      </div>
    );
  }

  return (
    <div className={className}>
      <ol className="space-y-3">
        {visible.map((entry, idx) => {
          const isFirst = page === 0 && idx === 0;
          const dotClass = BELT_DOT_CLASS[entry.belt as BeltColor] ?? "bg-muted";
          const labelClass = BELT_TEXT_CLASS[entry.belt as BeltColor] ?? "text-ink";

          return (
            <li key={entry.id} className="flex gap-3">
              {/* Timeline dot + connector */}
              <div className="flex flex-col items-center">
                <span
                  className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${dotClass} ${
                    isFirst ? "ring-2 ring-offset-2 ring-line" : ""
                  }`}
                />
                {idx < visible.length - 1 && (
                  <span className="flex-1 w-px bg-line mt-1" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-3 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`text-sm font-semibold capitalize ${labelClass}`}>
                      {entry.belt} belt
                    </span>
                    {entry.stripes > 0 && (
                      <StripePips count={entry.stripes} belt={entry.belt} />
                    )}
                  </div>
                  <span className="text-[11px] text-muted font-mono whitespace-nowrap flex-shrink-0 mt-0.5">
                    {formatDate(entry.promoted_at, timezone)}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[10px] font-mono tracking-wide text-muted uppercase bg-off-white px-1.5 py-0.5 rounded">
                    {labelForEvent(entry.event_type)}
                  </span>
                  {entry.promoted_by_name && (
                    <span className="text-[11px] text-muted truncate">
                      by {entry.promoted_by_name}
                    </span>
                  )}
                </div>

                {entry.notes && (
                  <p className="mt-1 text-xs text-muted leading-snug line-clamp-2">
                    {entry.notes}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Pager
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage(p => Math.max(0, p - 1))}
        onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
      />
    </div>
  );
}
