"use client";

import { ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  label: string;
  sortKey: string;
  currentSortKey: string | null;
  currentSortDir: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}

export default function SortableHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  onSort,
  className = "",
}: Props) {
  const active = currentSortKey === sortKey;

  return (
    <th
      className={`text-left px-4 py-3 cursor-pointer select-none hover:text-ink transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="flex flex-col -space-y-1">
          <ChevronUp
            className={`w-3 h-3 ${active && currentSortDir === "asc" ? "text-black" : "text-muted/40"}`}
          />
          <ChevronDown
            className={`w-3 h-3 ${active && currentSortDir === "desc" ? "text-black" : "text-muted/40"}`}
          />
        </span>
      </span>
    </th>
  );
}
