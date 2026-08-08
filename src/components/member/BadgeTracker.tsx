import { Target } from "lucide-react";
import { BadgeMedal } from "@/components/member/BadgeMedal";
import { badgeProgressPercent, hasProgressBar } from "@/lib/badge-progress";
import type { BadgeProgress } from "@/lib/badge-progress";
import type { Badge } from "@/lib/supabase/types";

/**
 * The tracked badge — one goal, with a bar under it.
 *
 * The badge wall shows thirty locked silhouettes, which is motivating in the way
 * a wall of thirty silhouettes is: not very. This is the videogame move instead —
 * pick ONE challenge, and the app tells you where you are on it every time you
 * look: "37 de 50 clases".
 *
 * Rendered on two surfaces with different rules, so it takes injected labels and a
 * `variant`, the same contract as StatsTilesGrid:
 *
 *   • the member portal — Spanish, from the catalogue, and interactive: the member
 *     picks and clears their own objective there.
 *   • the kiosk — English (that tablet has no NextIntlClientProvider yet), on
 *     black, and READ-ONLY. The kiosk knows who is standing at it from four digits
 *     of a phone number, which is enough to congratulate somebody and not nearly
 *     enough to let them change a stored preference; anyone waiting in line behind
 *     them could re-pick their goal. So the kiosk gets `onPick` omitted and shows
 *     the bar without any controls.
 *
 * Calling useTranslations here would put Spanish on the kiosk, which is the exact
 * bug the injected-labels pattern exists to prevent.
 */

export interface BadgeTrackerLabels {
  heading: string;
  /** Shown when nothing is being tracked. */
  emptyTitle: string;
  emptyBody: string;
  /** Button that opens the picker. */
  choose: string;
  change: string;
  clear: string;
  /**
   * "37 de 50 clases". A function rather than a template because the unit noun
   * agrees with the number in Spanish, and because "clases" and "días" are
   * different words rather than a substitution into one.
   */
  count: (current: number, target: number, unit: "classes" | "days") => string;
  /** "13 clases más" — the number that actually motivates. */
  remaining: (n: number, unit: "classes" | "days") => string;
  /** Bar reached the target but the award hasn't run yet. */
  complete: string;
  /** The two all-or-nothing rules, which have no fraction to show. */
  milestonePending: string;
  /** A badge only the profe can hand out — no rule to follow. */
  manual: string;
  /** Screen-reader description of the bar. */
  progressLabel: (current: number, target: number) => string;
}

const DEFAULT_LABELS: BadgeTrackerLabels = {
  heading: "Your goal",
  emptyTitle: "No goal picked",
  emptyBody: "Pick a badge in the member portal and your progress shows up here.",
  choose: "Pick a goal",
  change: "Change",
  clear: "Clear",
  count: (current, target, unit) => `${current} of ${target} ${unit === "days" ? "days" : "classes"}`,
  remaining: (n, unit) => `${n} more ${unit === "days" ? (n === 1 ? "day" : "days") : n === 1 ? "class" : "classes"}`,
  complete: "Done — it unlocks on your next check-in!",
  milestonePending: "Not yet — keep going!",
  manual: "Your coach awards this one by hand.",
  progressLabel: (current, target) => `${current} of ${target}`,
};

export interface BadgeTrackerProps {
  /** The tracked badge, or null when the member has no objective. */
  badge: Badge | null;
  /** Normalised counters for `badge`. Ignored when `badge` is null. */
  progress: BadgeProgress;
  variant?: "light" | "dark";
  labels?: Partial<BadgeTrackerLabels>;
  /**
   * Rendered next to the heading — the portal passes its picker/clear buttons
   * here. Omitted on the kiosk, which is read-only (see the header).
   */
  actions?: React.ReactNode;
  className?: string;
}

export default function BadgeTracker({
  badge,
  progress,
  variant = "light",
  labels: labelOverrides,
  actions,
  className = "",
}: BadgeTrackerProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const dark = variant === "dark";

  const heading = (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div
        className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 ${
          dark ? "text-white/40" : "text-muted"
        }`}
      >
        <Target className="w-3.5 h-3.5 flex-none" aria-hidden="true" />
        {labels.heading}
      </div>
      {actions}
    </div>
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  // Still a card rather than nothing at all: an absent tracker can't advertise
  // that the feature exists, and "pick a goal" is the whole call to action.
  if (!badge) {
    return (
      <div className={className}>
        {heading}
        <div className={`text-sm font-semibold ${dark ? "text-white/70" : "text-ink"}`}>
          {labels.emptyTitle}
        </div>
        <p className={`text-xs mt-1 ${dark ? "text-white/30" : "text-muted"}`}>{labels.emptyBody}</p>
      </div>
    );
  }

  const pct = badgeProgressPercent(progress);

  return (
    <div className={className}>
      {heading}

      <div className="flex items-center gap-3">
        {/* The medal is shown in full tier colour even though the badge is
            unearned — this is the prize, and greying it out would make the card
            look like the locked wall it exists to escape. */}
        <BadgeMedal
          icon={badge.icon}
          tier={badge.tier}
          earned
          size={dark ? "lg" : "md"}
          surface={variant}
        />
        <div className="min-w-0">
          <div
            className={`font-semibold leading-tight ${
              dark ? "text-lg text-white" : "text-sm text-black dark:text-ink"
            }`}
          >
            {badge.name}
          </div>
          <div className={`leading-tight ${dark ? "text-sm text-white/40" : "text-xs text-muted"}`}>
            {badge.description}
          </div>
        </div>
      </div>

      {hasProgressBar(progress) && (
        <>
          <div
            className={`mt-3 h-2 w-full rounded-full overflow-hidden ${dark ? "bg-white/10" : "bg-paper"}`}
            role="progressbar"
            aria-valuenow={progress.current}
            aria-valuemin={0}
            aria-valuemax={progress.target}
            aria-label={labels.progressLabel(progress.current, progress.target)}
          >
            <div
              className="h-full rounded-full bg-yellow transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              className={`font-semibold ${dark ? "text-base text-white" : "text-sm text-black dark:text-ink"}`}
            >
              {labels.count(progress.current, progress.target, progress.unit)}
            </span>
            <span className={`text-xs ${dark ? "text-white/40" : "text-muted"}`}>
              {progress.complete ? labels.complete : labels.remaining(progress.remaining, progress.unit)}
            </span>
          </div>
        </>
      )}

      {/* No bar for these three: a perfect month is not 90% perfect, and a badge
          the profe awards by hand has no rule to be partway through. Saying so
          beats a bar frozen at zero, which reads as a broken feature. */}
      {progress.kind === "binary" && (
        <p className={`mt-3 text-xs ${dark ? "text-white/40" : "text-muted"}`}>
          {progress.complete ? labels.complete : labels.milestonePending}
        </p>
      )}

      {(progress.kind === "manual" || progress.kind === "indeterminate") && (
        <p className={`mt-3 text-xs ${dark ? "text-white/40" : "text-muted"}`}>{labels.manual}</p>
      )}
    </div>
  );
}
