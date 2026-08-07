"use client";

import { useState } from "react";
import type { CheckInRow } from "@/lib/supabase/types";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { usePagination } from "@/lib/hooks/use-pagination";
import { normalizeDayPeriod } from "@/lib/utils";
import Pager from "@/components/ui/Pager";

// ── Copy ──────────────────────────────────────────────────────────────────────
//
// This component is shared by the member portal (Spanish, via next-intl) and the
// admin member-detail page (still English). It therefore does NOT call
// useTranslations itself: doing so would put Spanish rows inside an otherwise
// English admin page, which is the same mixed-language problem in a new place.
//
// Instead the copy is injected. The defaults below are the English the admin page
// already shows, so that surface is unchanged; the portal passes a Spanish set
// resolved from the catalogue at its own call site. When the admin pages get
// their own namespace, they pass one too and the defaults can go.

export interface CheckInsListLabels {
  empty: string;
  undo: string;
  /** Accessible name for the admin delete button. */
  delete: string;
  sourceStaff: string;
  sourceKiosk: string;
  /** A check-in the member made from their own phone. */
  sourcePortal: string;
  /** "1 total check-in" / "42 total check-ins" — plural-sensitive, hence a function. */
  total: (count: number) => string;
  /** "· showing most recent 50" — the leading separator is the caller's. */
  truncated: (rowCap: number) => string;
}

const DEFAULT_LABELS: CheckInsListLabels = {
  empty: "No check-ins yet.",
  undo: "Undo",
  delete: "Delete check-in",
  sourceStaff: "staff",
  sourceKiosk: "kiosk",
  sourcePortal: "phone",
  total: (n) => `${n.toLocaleString()} total check-in${n === 1 ? "" : "s"}`,
  truncated: (rowCap) => `showing most recent ${rowCap}`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCheckInDate(classDate: string, locale: string): string {
  // Parse as local midnight to avoid UTC shift on "YYYY-MM-DD" strings.
  const [y, m, d] = classDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatCheckInTime(checkedInAt: string, locale: string): string {
  try {
    // normalizeDayPeriod, not raw output: this row is server-rendered and then
    // hydrated, and Node and Chromium disagree on the space inside Spanish
    // "a. m." — enough to trip React's text-mismatch check. See the helper.
    return normalizeDayPeriod(
      new Date(checkedInAt).toLocaleTimeString(locale, {
        hour: "numeric",
        minute: "2-digit",
      })
    );
  } catch {
    return "";
  }
}

// ── Source badge ──────────────────────────────────────────────────────────────

/**
 * Where the check-in came from.
 *
 * Three-way, where this used to be `isAdmin ? "staff" : "kiosk"`. Self check-in
 * from the portal now exists, and under the old branch every one of those rows
 * was labelled "kiosk" — which is exactly the row a member is most likely to be
 * looking at, and the label was telling them they'd been checked in at a desk
 * they never walked up to. Translating a wrong label would only have made it a
 * confidently wrong Spanish one.
 */
function SourceBadge({
  source,
  labels,
}: {
  source: CheckInRow["source"];
  labels: CheckInsListLabels;
}) {
  const isAdmin = source === "admin";
  const label =
    source === "admin" ? labels.sourceStaff
    : source === "portal" ? labels.sourcePortal
    : labels.sourceKiosk;
  return (
    <span
      className={`text-[10px] font-mono tracking-wide px-1.5 py-0.5 rounded ${
        isAdmin
          ? "bg-yellow/15 text-yellow-dark"
          : "bg-off-white text-muted"
      }`}
    >
      {label}
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
  /**
   * Overrides for any of the rendered strings. Merged over the English defaults,
   * so a caller can pass only the ones it cares about. See the Copy block above
   * for why these are props rather than catalogue lookups.
   */
  labels?: Partial<CheckInsListLabels>;
  /**
   * BCP 47 tag for the date and time columns. Defaults to "en-US" — what this
   * component hard-coded before — so the admin page renders exactly as it did.
   */
  locale?: string;
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
  labels: labelOverrides,
  locale = "en-US",
  className = "",
}: CheckInsListProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
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
        {labels.empty}
      </div>
    );
  }

  return (
    <div className={className}>
      {totalLifetime !== undefined && (
        <p className="text-xs text-muted mb-3">
          {labels.total(totalLifetime)}
          {rowCap !== undefined && isTruncated && ` · ${labels.truncated(rowCap)}`}
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
                  <SourceBadge source={row.source} labels={labels} />
                </div>
                <div className="text-[11px] text-muted mt-0.5 font-mono">
                  {formatCheckInDate(row.class_date, locale)}
                  {" · "}
                  {formatCheckInTime(row.checked_in_at, locale)}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {showUndo && (
                  <button
                    onClick={() => handleUndo(row.id)}
                    disabled={isBusy}
                    className="text-xs text-muted hover:text-danger underline underline-offset-2 transition-colors"
                  >
                    {isBusy ? "…" : labels.undo}
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => handleDelete(row.id)}
                    disabled={isBusy}
                    aria-label={labels.delete}
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
