"use client";

import { useState } from "react";
import CheckInsList from "@/components/member/CheckInsList";
import { undoOwnCheckIn } from "@/lib/actions/portal";
import type { CheckInRow } from "@/lib/supabase/types";

interface Props {
  initial: CheckInRow[];
  /** ISO date "YYYY-MM-DD" in gym-local timezone — gates undo eligibility. */
  today: string;
}

/**
 * Portal landing check-ins card.
 * Owns undo state and error display; delegates rendering to CheckInsList.
 */
export default function PortalCheckInsCard({ initial, today }: Props) {
  const [checkIns, setCheckIns] = useState<CheckInRow[]>(initial);
  const [error, setError] = useState<string | null>(null);

  async function handleUndo(id: number) {
    setError(null);
    const result = await undoOwnCheckIn(id);
    if ("success" in result) {
      setCheckIns(prev => prev.filter(c => c.id !== id));
    } else {
      setError(result.error ?? "Could not undo check-in. Please try again.");
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3 text-xs text-danger bg-danger-light border border-danger-border rounded px-3 py-2">
          {error}
        </p>
      )}
      <CheckInsList
        checkIns={checkIns}
        onUndo={handleUndo}
        canUndo={row => row.class_date === today}
        emptyText="No classes checked in today."
      />
    </div>
  );
}
