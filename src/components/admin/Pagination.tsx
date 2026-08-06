"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between pt-4 text-sm">
      <span className="text-muted text-xs">
        {start}–{end} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="w-8 h-8 flex items-center justify-center rounded border border-line hover:border-black disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {/* Show up to 5 page buttons, centered on current */}
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => {
            if (totalPages <= 5) return true;
            if (p === 1 || p === totalPages) return true;
            return Math.abs(p - page) <= 1;
          })
          .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
            if (i > 0 && p - (arr[i - 1]) > 1) acc.push("ellipsis");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e${i}`} className="w-6 text-center text-muted">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`w-8 h-8 flex items-center justify-center rounded text-xs font-semibold transition-colors ${
                  p === page
                    ? "bg-black text-white"
                    : "border border-line hover:border-black"
                }`}
              >
                {p}
              </button>
            )
          )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="w-8 h-8 flex items-center justify-center rounded border border-line hover:border-black disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
