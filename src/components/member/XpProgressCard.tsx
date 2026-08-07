import { Zap } from "lucide-react";
import type { MemberGamification } from "@/lib/supabase/types";

/**
 * XP + level card with a progress bar.
 *
 * The bar is intentionally the widest element in the card: the whole point of
 * the feature is that a member sees it move after class. It shows progress
 * within the CURRENT level rather than lifetime XP, because a bar that gets
 * permanently slower as it fills stops being motivating.
 */
export default function XpProgressCard({ data }: { data: MemberGamification }) {
  // Clamped so an unexpected value can't overflow the track.
  const pct = Math.max(0, Math.min(100, Math.round((data.xp_into_level / data.xp_for_level) * 100)));
  const remaining = Math.max(0, data.xp_for_level - data.xp_into_level);

  return (
    <div className="bg-white border border-line rounded-lg p-5 flex flex-col">
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Level</div>

      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl text-black leading-none">{data.level}</span>
        <span className="text-sm text-muted">{data.xp_total.toLocaleString()} XP</span>
      </div>

      <div
        className="mt-3 h-2 w-full bg-paper rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={data.xp_into_level}
        aria-valuemin={0}
        aria-valuemax={data.xp_for_level}
        aria-label={`Level ${data.level}: ${data.xp_into_level} of ${data.xp_for_level} XP`}
      >
        <div
          className="h-full rounded-full bg-yellow transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 text-xs text-muted flex items-center gap-1">
        <Zap className="w-3 h-3 flex-none" aria-hidden="true" />
        <span>
          {remaining === 0
            ? `Level ${data.level + 1} unlocked!`
            : `${remaining} XP to level ${data.level + 1}`}
        </span>
      </div>
    </div>
  );
}
