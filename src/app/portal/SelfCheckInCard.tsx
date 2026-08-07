"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { selfCheckIn, type PortalTodayClass } from "@/lib/actions/portal";
import { SpinnerButton } from "@/components/ui/Spinner";
import { badgeIcon, TIER_STYLES } from "@/lib/badges";
import type { AwardedBadge } from "@/lib/actions/check-ins";

/**
 * Self check-in from the member's own phone.
 *
 * There is deliberately no time-window or geolocation gate: a member can check
 * into any of today's active classes at any hour. That was an explicit product
 * decision — the gym would rather have imperfect attendance data than members
 * who stop logging because the button was greyed out when they got home. The
 * `source: "portal"` column (set server-side in selfCheckIn) is what keeps it
 * auditable: staff can tell a phone check-in from a front-desk one and undo it.
 *
 * The list is server-rendered by the page. After a successful write we flip the
 * row locally rather than refetching, because the only thing that changed is the
 * flag we already know the new value of — and a router.refresh() here would
 * re-run every query on the portal landing page for one boolean.
 */
export default function SelfCheckInCard({ classes }: { classes: PortalTodayClass[] }) {
  const [rows, setRows] = useState(classes);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [awarded, setAwarded] = useState<AwardedBadge[]>([]);

  function handleCheckIn(slotId: number) {
    setError(null);
    setPendingId(slotId);
    startTransition(async () => {
      const result = await selfCheckIn(slotId);
      setPendingId(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === slotId ? { ...r, already_checked_in: true } : r)),
      );
      if (result.awardedBadges.length > 0) {
        setAwarded((prev) => [...prev, ...result.awardedBadges]);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">No classes on the schedule today.</p>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-3 text-xs text-danger bg-danger-light border border-danger-border rounded px-3 py-2">
          {error}
        </p>
      )}

      <ul className="divide-y divide-line">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink truncate">{c.name}</div>
              <div className="text-xs text-muted">
                {formatTime(c.start_time)}
                {c.modality_name && ` · ${c.modality_name}`}
              </div>
            </div>

            {c.already_checked_in ? (
              // Not a disabled button: there is no action left to take, so a
              // button would advertise one. Undo lives in the check-ins card.
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                Checked in
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleCheckIn(c.id)}
                disabled={pendingId !== null}
                className="shrink-0 px-3 py-1.5 bg-black text-white dark:bg-yellow dark:text-black rounded text-xs font-bold uppercase tracking-wider hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {pendingId === c.id ? <SpinnerButton label="Checking in" /> : "Check in"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Inline strip rather than the BadgeCelebration modal. That modal takes an
          EarnedBadge (a full catalogue row joined with the award), but the check-in
          RPC returns only slug/name/icon/tier — no description or xp_reward — so
          feeding it here would render an empty description and "+undefined XP".
          The badges also show up properly on the wall below after any reload,
          which is where the full detail lives. */}
      {awarded.length > 0 && (
        <div className="mt-4 pt-4 border-t border-line">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2.5">
            {awarded.length === 1 ? "New badge unlocked" : `${awarded.length} new badges unlocked`}
          </p>
          <div className="flex flex-col gap-2">
            {awarded.map((b) => {
              const Icon = badgeIcon(b.badge_icon);
              const tier = TIER_STYLES[b.badge_tier];
              return (
                <div
                  key={b.badge_slug}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-paper"
                >
                  <span
                    className="w-9 h-9 flex-none rounded-full flex items-center justify-center border"
                    style={{ backgroundColor: tier.bg, borderColor: tier.fg, color: tier.fg }}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink leading-tight truncate">
                      {b.badge_name}
                    </span>
                    <span className="block text-[11px] uppercase tracking-wide" style={{ color: tier.fg }}>
                      {tier.label}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "HH:MM:SS" → "6:30 PM".
 *
 * Parsed by hand rather than through Date: the string is a gym-local wall clock
 * with no date attached, so feeding it to a Date constructor would attach
 * today's date in the *browser's* zone and shift the time for anyone travelling.
 */
function formatTime(startTime: string): string {
  const [hStr, mStr] = startTime.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
}
