"use client";

import { useState, useEffect } from "react";

export interface PaginationResult<T> {
  visible: T[];
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
}

/**
 * Slices `items` into pages of `pageSize` and manages the current-page index.
 *
 * When the item count changes (e.g. after a delete or optimistic update), the
 * page is *clamped* to the last valid index rather than reset to 0. This
 * prevents the user from being teleported back to the top while browsing.
 */
export function usePagination<T>(items: T[], pageSize: number): PaginationResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(p => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  const visible = items.slice(page * pageSize, (page + 1) * pageSize);
  return { visible, page, setPage, totalPages };
}
