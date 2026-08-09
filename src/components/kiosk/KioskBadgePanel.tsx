"use client";

import { BadgeTile } from "@/components/member/BadgeMedal";
import BadgeTracker from "@/components/member/BadgeTracker";
import Spinner from "@/components/ui/Spinner";
import type { KioskBadges } from "@/lib/actions/check-ins";
import type { TrackedBadgeEntry } from "@/lib/badge-progress";

/**
 * The kiosk's badges tab: the member's goal on top, their wall underneath.
 *
 * Its own tab rather than more rows on the profile card, because the profile card
 * is already at the limit of a 768px-tall tablet — the yellow "Check In" button
 * has to stay above the fold or the primary action of the entire device
 * disappears. Badges are what a member lingers on; check-in is what they came for.
 * A tab keeps both.
 *
 * Sizing is for a shared touchscreen read standing up, so it is deliberately
 * bigger than the portal's wall: `lg` medals (80px vs 56px) and three columns
 * instead of six. A phone can afford a 6-across grid because it is held at 30cm;
 * the same grid on a wall-mounted tablet is a row of unidentifiable dots.
 *
 * English, like the rest of the kiosk — this tablet has no NextIntlClientProvider.
 * The strings live here rather than being injected because nothing else renders
 * this panel; the two pieces it composes (BadgeTile, BadgeTracker) are the shared
 * ones and they take their copy from above.
 */
export default function KioskBadgePanel({
  badges,
  tracked,
  loading,
}: {
  badges: KioskBadges | null;
  /** Up to three goals, oldest first. `null` while the tab is still loading. */
  tracked: TrackedBadgeEntry[] | null;
  loading: boolean;
}) {
  if (loading || !badges) {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <Spinner size="md" delay={false} className="text-white/30" />
      </div>
    );
  }

  const total = badges.earned.length + badges.locked.length;

  return (
    // The scroll lives here, inside the tab, so the page itself still never
    // scrolls — the kiosk layout's one hard rule.
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
      {tracked && (
        <div className="rounded-2xl bg-white/5 px-4 py-4 mb-4">
          <BadgeTracker
            tracked={tracked}
            variant="dark"
            labels={{
              heading: tracked.length === 1 ? "Your goal" : "Your goals",
              // Read-only here: the kiosk knows who you are from four digits of a
              // phone number, which is not an identity to store preferences
              // against. Picking goals happens in the portal — so no `actions` and
              // no `rowActions`.
              emptyTitle: "No goals picked yet",
              emptyBody: "Pick up to 3 badges in your member portal and they show up here.",
              // Suppressed at one goal: "1/3" next to a single bar reads as a
              // limit the member is being warned about, on a surface where they
              // can't do anything about it anyway.
              slots: (used, max) => (used > 1 ? `${used}/${max}` : ""),
            }}
          />
        </div>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/25">
          Badges
        </span>
        <span className="text-sm text-white/40">
          {badges.earned.length} / {total}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-white/25 text-sm py-6 text-center">No badges to show yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 pb-2">
          {/* Earned first — the member's own wall, then what is left to chase. */}
          {badges.earned.map((item) => (
            <BadgeTile
              key={item.badge.id}
              badge={item.badge}
              earned
              note={item.note}
              size="lg"
              surface="dark"
            />
          ))}
          {badges.locked.map((badge) => (
            <BadgeTile
              key={badge.id}
              badge={badge}
              earned={false}
              size="lg"
              surface="dark"
              lockedLabel="Locked"
            />
          ))}
        </div>
      )}
    </div>
  );
}
