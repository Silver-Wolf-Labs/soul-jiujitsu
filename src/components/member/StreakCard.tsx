import { Flame } from "lucide-react";
import { useTranslations } from "next-intl";
import { colors } from "@/lib/theme";
import type { MemberGamification } from "@/lib/supabase/types";

/**
 * Training-day streak card.
 *
 * "Days" means days the GYM WAS OPEN, not calendar days — this gym is closed on
 * Sundays, so a literal consecutive-days streak would reset every week for every
 * member. The copy says "training days" so the number doesn't look broken to
 * someone counting on a calendar.
 */
export default function StreakCard({ data }: { data: MemberGamification }) {
  // Portal-only, so translations are resolved here — same reasoning as
  // XpProgressCard.
  const t = useTranslations("portal.streak");
  const alive = data.streak_days > 0;
  const isRecord = alive && data.streak_days >= data.longest_streak;

  return (
    <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5 flex flex-col">
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t("heading")}</div>

      <div className="flex items-baseline gap-2">
        <Flame
          className={`w-6 h-6 flex-none self-center ${alive ? "" : "opacity-30"}`}
          style={alive ? { color: colors.orange } : undefined}
          aria-hidden="true"
        />
        <span className={`font-display text-3xl leading-none ${alive ? "text-black dark:text-ink" : "text-muted"}`}>
          {data.streak_days}
        </span>
        {/* The number stays in its own span above; `days` is the noun alone, and
            ICU-selected on the count because "día"/"días" is not a suffix rule. */}
        <span className="text-sm text-muted">
          {t("days", { count: data.streak_days })}
        </span>
      </div>

      <div className="mt-2 text-xs text-muted">
        {isRecord && data.streak_days > 1 ? (
          <span className="font-semibold text-black dark:text-ink">{t("personalBest")}</span>
        ) : alive ? (
          t("best", { count: data.longest_streak })
        ) : data.longest_streak > 0 ? (
          t("trainToRestart", { count: data.longest_streak })
        ) : (
          t("startYourStreak")
        )}
      </div>

      <div className="mt-1 text-xs text-muted opacity-70">
        {t("sundaysDontCount")}
      </div>
    </div>
  );
}
