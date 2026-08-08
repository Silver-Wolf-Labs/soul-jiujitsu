import { useTranslations } from "next-intl";
import { CATEGORY_ORDER } from "@/lib/badges";
import { BadgeTile } from "@/components/member/BadgeMedal";
import type { Badge, EarnedBadge, BadgeCategory } from "@/lib/supabase/types";

/**
 * The member's badge wall: earned badges in their tier colour, unearned ones as
 * locked silhouettes.
 *
 * Locked badges are shown on purpose — they're the goals, and hiding them would
 * remove the reason to chase them. Secret badges are filtered out upstream in
 * getOwnBadges so a surprise stays a surprise.
 *
 * Badge names, descriptions and the profe's award notes come from the database and
 * render exactly as they were written — the gym authored them. The chrome around
 * them (the heading, the counter, the category headings) is the system talking, so
 * it comes from the catalogue.
 *
 * The tile itself now comes from BadgeMedal: the same medal is drawn on the kiosk
 * profile, on the kiosk success screen and in the celebration modal, and it used to
 * be four hand-copies of the same disc. This file keeps the grouping, the counters
 * and the layout — the parts that are specifically the portal's badge WALL.
 */

export default function BadgeGrid({
  earned,
  locked,
}: {
  earned: EarnedBadge[];
  locked: Badge[];
}) {
  const t = useTranslations("portal.badges");
  // The five categories are a code-side enum, not something the profe types, so
  // their labels belong in the catalogue. CATEGORY_LABELS in @/lib/badges stays
  // put — the admin console still reads it, and it is on a later i18n phase.
  const tCategory = useTranslations("portal.badges.categories");
  // Group both sets by category so a member sees "Hitos: 3 of 7" rather than one
  // undifferentiated wall of 31 tiles.
  const byCategory = CATEGORY_ORDER.map((category: BadgeCategory) => ({
    category,
    earned: earned.filter((e) => e.badge.category === category),
    locked: locked.filter((b) => b.category === category),
  })).filter((g) => g.earned.length + g.locked.length > 0);

  if (byCategory.length === 0) return null;

  return (
    <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-xl text-black dark:text-ink">{t("heading")}</h2>
        <span className="text-sm text-muted">
          {t("earnedOfTotal", { earned: earned.length, total: earned.length + locked.length })}
        </span>
      </div>

      <div className="space-y-6">
        {byCategory.map((group) => (
          <div key={group.category}>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              {tCategory(group.category)}
              <span className="ml-2 font-normal normal-case tracking-normal">
                {group.earned.length}/{group.earned.length + group.locked.length}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-5">
              {/* Earned first: the member's own wall, then what's left to chase. */}
              {group.earned.map((item) => (
                <BadgeTile
                  key={item.badge.id}
                  badge={item.badge}
                  earned
                  note={item.note}
                />
              ))}
              {group.locked.map((badge) => (
                <BadgeTile
                  key={badge.id}
                  badge={badge}
                  earned={false}
                  // The lock is a 10px icon at 45% opacity: unmistakable to a
                  // sighted member scanning the wall and completely silent to a
                  // screen reader without this.
                  lockedLabel={t("lockedLabel")}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
