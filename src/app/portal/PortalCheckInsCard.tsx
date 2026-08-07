"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import CheckInsList from "@/components/member/CheckInsList";
import { undoOwnCheckIn } from "@/lib/actions/portal";
import { DEFAULT_LOCALE } from "@/i18n/config";
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
  const t = useTranslations("portal.home");
  const tList = useTranslations("portal.checkInsList");
  const [checkIns, setCheckIns] = useState<CheckInRow[]>(initial);
  const [error, setError] = useState<string | null>(null);

  async function handleUndo(id: number) {
    setError(null);
    const result = await undoOwnCheckIn(id);
    if ("success" in result) {
      setCheckIns(prev => prev.filter(c => c.id !== id));
    } else {
      // The action's message is already Spanish, from portal.errors. The
      // fallback covers the shape being wrong, which shouldn't happen.
      setError(result.error ?? t("undoFailed"));
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3 text-xs text-danger bg-danger-light border border-danger-border rounded px-3 py-2">
          {error}
        </p>
      )}
      {/* CheckInsList is shared with the still-English admin member page, so its
          copy is injected rather than looked up inside it. See the Copy block
          in that file. */}
      <CheckInsList
        checkIns={checkIns}
        onUndo={handleUndo}
        canUndo={row => row.class_date === today}
        locale={DEFAULT_LOCALE}
        labels={{
          empty: t("noCheckInsToday"),
          undo: tList("undo"),
          sourceStaff: tList("sourceStaff"),
          sourceKiosk: tList("sourceKiosk"),
          sourcePortal: tList("sourcePortal"),
        }}
      />
    </div>
  );
}
