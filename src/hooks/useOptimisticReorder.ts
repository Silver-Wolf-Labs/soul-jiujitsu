import { useCallback, useRef, useState } from "react";

/**
 * Generic optimistic reorder hook.
 *
 * Immediately swaps two items in local state, fires the API in the
 * background, and rolls back + shows an error on failure.
 *
 * @param items      The current array (must be sorted by `orderKey`)
 * @param setItems   State setter for the array
 * @param orderKey   Property name holding the numeric display_order
 * @param idKey      Property name holding the unique ID
 */
export function useOptimisticReorder<T extends object>(
  items: T[],
  setItems: (items: T[]) => void,
  orderKey: keyof T & string,
  idKey: keyof T & string,
) {
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reorder = useCallback(
    async (
      item: T,
      direction: "up" | "down",
      apiCall: () => Promise<unknown>,
    ) => {
      // Prevent overlapping reorders — queue would add complexity;
      // a simple gate is good enough for click cadence.
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);

      const snapshot = [...items];
      const idx = items.findIndex((i) => i[idKey] === item[idKey]);
      if (idx < 0) { inFlight.current = false; return; }

      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= items.length) { inFlight.current = false; return; }

      // Optimistic swap — mutate order values and re-sort
      const next = items.map((i) => ({ ...i }));
      const aOrder = next[idx][orderKey] as number;
      const bOrder = next[swapIdx][orderKey] as number;
      (next[idx] as Record<string, unknown>)[orderKey] = bOrder;
      (next[swapIdx] as Record<string, unknown>)[orderKey] = aOrder;
      next.sort((a, b) => (a[orderKey] as number) - (b[orderKey] as number));
      setItems(next);

      try {
        await apiCall();
      } catch {
        // Rollback
        setItems(snapshot);
        setError("Reorder failed — please try again.");
        setTimeout(() => setError(null), 4000);
      } finally {
        inFlight.current = false;
      }
    },
    [items, setItems, orderKey, idKey],
  );

  return { reorder, error };
}
