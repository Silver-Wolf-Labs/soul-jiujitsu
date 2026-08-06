/**
 * Reusable pagination controls.
 * Renders nothing when totalPages ≤ 1.
 */
export default function Pager({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
      <button
        type="button"
        onClick={onPrev}
        disabled={page === 0}
        className="text-xs text-muted hover:text-ink disabled:opacity-30 transition-colors"
      >
        ← Newer
      </button>
      <span className="text-[11px] text-muted font-mono">
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={page === totalPages - 1}
        className="text-xs text-muted hover:text-ink disabled:opacity-30 transition-colors"
      >
        Older →
      </button>
    </div>
  );
}
