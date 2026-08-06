"use client";

import { useState } from "react";
import type { CheckInRow } from "@/lib/supabase/types";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { usePagination } from "@/lib/hooks/use-pagination";
import Pager from "@/components/ui/Pager";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCheckInDate(classDate: string): string {
  // Parse as local midnight to avoid UTC shift on "YYYY-MM-DD" strings.
  const [y, m, d] = classDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatCheckInTime(checkedInAt: string): string {
  try {
    return new Date(checkedInAt).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: CheckInRow["source"] }) {
  const isAdmin = source === "admin";
  return (
    <span
      className={`text-[10px] font-mono tracking-wide px-1.5 py-0.5 rounded ${
        isAdmin
          ? "bg-yellow/15 text-yellow-dark"
          : "bg-off-white text-muted"
      }`}
    >
      {isAdmin ? "staff" : "kiosk"}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface CheckInsListProps {
  checkIns: CheckInRow[];
  /** Items per page on desktop (≥ 641 px). Default: 5. */
  pageSize?: number;
  /** Items per page on mobile (≤ 640 px). Default: 3. */
  mobilePageSize?: number;
  /**
   * Admin delete callback — when provided, an × button appears on every row.
   * Only one row can be in a pending state at a time.
   */
  onDelete?: (id: number) => void | Promise<void>;
  /**
   * Member undo callback — when provided, an "Undo" link appears on eligible rows.
   * Only one row can be in a pending state at a time.
   */
  onUndo?: (id: number) => void | Promise<void>;
  /**
   * Predicate that controls undo visibility per row.
   * Typically: `row => row.class_date === todayISODate`.
   * Only consulted when `onUndo` is provided.
   */
  canUndo?: (row: CheckInRow) => boolean;
  /** Lifetime check-in count — shown in the header when provided. */
  totalLifetime?: number;
  /**
   * Maximum rows the caller fetched. When `checkIns.length === rowCap` and
   * `totalLifetime > rowCap`, a "showing first N" note is rendered.
   */
  rowCap?: number;
  /** Shown when the list is empty. */
  emptyText?: string;
  className?: string;
}

/**
 * Paginated check-in history list.
 *
 * Pure display — parents own data fetching, mutations, and optimistic updates.
 * Three modes:
 *   1. Read-only   — no `onDelete` or `onUndo`
 *   2. Admin delete — `onDelete`; × button on every row
 *   3. Member undo  — `onUndo` + `canUndo`; Undo link on eligible rows only
 *
 * Page is clamped (not reset) when items change to preserve browsing position.
 * Only one row can be in a pending/busy state at a time (pendingRowId mutex).
 */
export default function CheckInsList({
  checkIns,
  pageSize = 5,
  mobilePageSize = 3,
  onDelete,
  onUndo,
  canUndo,
  totalLifetime,
  rowCap,
  emptyText = "No check-ins yet.",
  className = "",
}: CheckInsListProps) {
  const isMobile = useIsMobile();
  const effectivePageSize = isMobile ? mobilePageSize : pageSize;
  const { visible, page, setPage, totalPages } = usePagination(checkIns, effectivePageSize);

  // Only one row can mutate at a time — prevents double-clicks and race conditions.
  const [pendingRowId, setPendingRowId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    if (!onDelete || pendingRowId !== null) return;
    setPendingRowId(id);
    try { await onDelete(id); } finally { setPendingRowId(null); }
  }

  async function handleUndo(id: number) {
    if (!onUndo || pendingRowId !== null) return;
    setPendingRowId(id);
    try { await onUndo(id); } finally { setPendingRowId(null); }
  }

  const isTruncated =
    rowCap !== undefined && checkIns.length >= rowCap && (totalLifetime ?? 0) > rowCap;

  if (checkIns.length === 0) {
    return (
      <div className={`text-sm text-muted py-6 text-center ${className}`}>
        {emptyText}
      </div>
    );
  }

  return (
    <div className={className}>
      {totalLifetime !== undefined && (
        <p className="text-xs text-muted mb-3">
          {totalLifetime.toLocaleString()} total check-in{totalLifetime === 1 ? "" : "s"}
          {isTruncated && ` · showing most recent ${rowCap}`}
        </p>
      )}

      <ul className="divide-y divide-line">
        {visible.map(row => {
          const isBusy = pendingRowId === row.id;
          const showUndo = !!onUndo && (!canUndo || canUndo(row));

          return (
            <li
              key={row.id}
              className={`flex items-center gap-3 py-2.5 transition-opacity ${
                isBusy ? "opacity-40 pointer-events-none" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink truncate">
                    {row.class_name}
                  </span>
                  <SourceBadge source={row.source} />
                </div>
                <div className="text-[11px] text-muted mt-0.5 font-mono">
                  {formatCheckInDate(row.class_date)}
                  {" · "}
                  {formatCheckInTime(row.checked_in_at)}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {showUndo && (
                  <button
                    onClick={() => handleUndo(row.id)}
                    disabled={isBusy}
                    className="text-xs text-muted hover:text-danger underline underline-offset-2 transition-colors"
                  >
                    {isBusy ? "…" : "Undo"}
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => handleDelete(row.id)}
                    disabled={isBusy}
                    aria-label="Delete check-in"
                    className="text-muted hover:text-danger transition-colors p-1 rounded hover:bg-danger/5"
                  >
                    {isBusy ? (
                      <span className="text-xs">…</span>
                    ) : (
                      <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
                        <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Pager
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage(p => Math.max(0, p - 1))}
        onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
      />
    </div>
  );
}
