import { Lock } from "lucide-react";
import { badgeIcon, TIER_STYLES, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/badges";
import type { Badge, EarnedBadge, BadgeCategory } from "@/lib/supabase/types";

/**
 * The member's badge wall: earned badges in their tier colour, unearned ones as
 * locked silhouettes.
 *
 * Locked badges are shown on purpose — they're the goals, and hiding them would
 * remove the reason to chase them. Secret badges are filtered out upstream in
 * getOwnBadges so a surprise stays a surprise.
 *
 * Note the badge names and descriptions come from the database in Spanish (the
 * language members read), while the surrounding portal chrome is English. That
 * mixture is deliberate here rather than accidental.
 */

function EarnedTile({ item }: { item: EarnedBadge }) {
  const Icon = badgeIcon(item.badge.icon);
  const tier = TIER_STYLES[item.badge.tier];

  return (
    <div className="flex flex-col items-center text-center gap-1.5">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center border"
        style={{ backgroundColor: tier.bg, borderColor: tier.fg, color: tier.fg }}
      >
        <Icon className="w-7 h-7" aria-hidden="true" />
      </div>
      <div className="text-xs font-semibold text-black leading-tight">{item.badge.name}</div>
      <div className="text-[11px] text-muted leading-tight">{item.badge.description}</div>
      {/* The profe's note on a manual award — the part members screenshot. */}
      {item.note && (
        <div className="text-[11px] text-ink italic leading-tight mt-0.5">
          &ldquo;{item.note}&rdquo;
        </div>
      )}
    </div>
  );
}

function LockedTile({ badge }: { badge: Badge }) {
  const Icon = badgeIcon(badge.icon);

  return (
    <div className="flex flex-col items-center text-center gap-1.5 opacity-45">
      <div className="relative w-14 h-14 rounded-full flex items-center justify-center border border-line bg-paper text-muted">
        <Icon className="w-7 h-7" aria-hidden="true" />
        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white border border-line flex items-center justify-center">
          <Lock className="w-2.5 h-2.5 text-muted" aria-hidden="true" />
        </span>
      </div>
      <div className="text-xs font-semibold text-ink leading-tight">{badge.name}</div>
      <div className="text-[11px] text-muted leading-tight">{badge.description}</div>
    </div>
  );
}

export default function BadgeGrid({
  earned,
  locked,
}: {
  earned: EarnedBadge[];
  locked: Badge[];
}) {
  // Group both sets by category so a member sees "Hitos: 3 of 7" rather than one
  // undifferentiated wall of 31 tiles.
  const byCategory = CATEGORY_ORDER.map((category: BadgeCategory) => ({
    category,
    earned: earned.filter((e) => e.badge.category === category),
    locked: locked.filter((b) => b.category === category),
  })).filter((g) => g.earned.length + g.locked.length > 0);

  if (byCategory.length === 0) return null;

  return (
    <div className="bg-white border border-line rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-xl text-black">Achievements</h2>
        <span className="text-sm text-muted">
          {earned.length} of {earned.length + locked.length}
        </span>
      </div>

      <div className="space-y-6">
        {byCategory.map((group) => (
          <div key={group.category}>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              {CATEGORY_LABELS[group.category]}
              <span className="ml-2 font-normal normal-case tracking-normal">
                {group.earned.length}/{group.earned.length + group.locked.length}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-5">
              {/* Earned first: the member's own wall, then what's left to chase. */}
              {group.earned.map((item) => (
                <EarnedTile key={item.badge.id} item={item} />
              ))}
              {group.locked.map((badge) => (
                <LockedTile key={badge.id} badge={badge} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
