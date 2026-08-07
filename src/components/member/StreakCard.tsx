import { Flame } from "lucide-react";
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
  const alive = data.streak_days > 0;
  const isRecord = alive && data.streak_days >= data.longest_streak;

  return (
    <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5 flex flex-col">
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Streak</div>

      <div className="flex items-baseline gap-2">
        <Flame
          className={`w-6 h-6 flex-none self-center ${alive ? "" : "opacity-30"}`}
          style={alive ? { color: colors.orange } : undefined}
          aria-hidden="true"
        />
        <span className={`font-display text-3xl leading-none ${alive ? "text-black dark:text-ink" : "text-muted"}`}>
          {data.streak_days}
        </span>
        <span className="text-sm text-muted">
          training day{data.streak_days === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-2 text-xs text-muted">
        {isRecord && data.streak_days > 1 ? (
          <span className="font-semibold text-black dark:text-ink">Personal best — keep it going</span>
        ) : alive ? (
          <>Best: {data.longest_streak} day{data.longest_streak === 1 ? "" : "s"}</>
        ) : data.longest_streak > 0 ? (
          <>Train today to start again · best {data.longest_streak}</>
        ) : (
          <>Come to class to start your streak</>
        )}
      </div>

      <div className="mt-1 text-xs text-muted opacity-70">
        Sundays don&apos;t break it — the gym is closed.
      </div>
    </div>
  );
}
