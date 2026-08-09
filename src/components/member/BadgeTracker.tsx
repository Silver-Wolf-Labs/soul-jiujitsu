import { Target } from "lucide-react";
import { BadgeMedal } from "@/components/member/BadgeMedal";
import { badgeProgressPercent, hasProgressBar, MAX_TRACKED_BADGES } from "@/lib/badge-progress";
import type { TrackedBadgeEntry } from "@/lib/badge-progress";

/**
 * The tracked badges — up to three goals, each with a bar under it.
 *
 * The badge wall shows thirty locked silhouettes, which is motivating in the way a
 * wall of thirty silhouettes is: not very. This is the videogame move instead —
 * pick a few challenges, and the app tells you where you are on each one every time
 * you look: "37 de 50 clases".
 *
 * Three rather than one, because one turned out to make every OTHER kind of
 * progress invisible: a member chasing "50 clases" had nothing to show for the
 * Saturday they trained or the streak they were on. Three is also the ceiling —
 * past that the card becomes the wall of silhouettes it exists to escape, which is
 * why MAX_TRACKED_BADGES is enforced in the database rather than being a suggestion
 * here (see 20260816000000_tracked_badges_multi.sql).
 *
 * This component owns the LIST: the heading, the empty state, and one row per goal.
 * It is deliberately the whole thing rather than a single row with the loop pushed
 * up into the two callers, because the empty state and the "2 / 3" counter are
 * properties of the list and duplicating them across the portal and the kiosk is
 * how the two surfaces drift.
 *
 * Rendered on two surfaces with different rules, so it takes injected labels and a
 * `variant`, the same contract as StatsTilesGrid:
 *
 *   • the member portal — Spanish, from the catalogue, and interactive: the member
 *     adds and removes their own objectives there.
 *   • the kiosk — English (that tablet has no NextIntlClientProvider yet), on
 *     black, and READ-ONLY. The kiosk knows who is standing at it from four digits
 *     of a phone number, which is enough to congratulate somebody and not nearly
 *     enough to let them change a stored preference; anyone waiting in line behind
 *     them could re-pick their goals. So the kiosk omits `actions` and `rowActions`
 *     and shows the bars without any controls.
 *
 * Calling useTranslations here would put Spanish on the kiosk, which is the exact
 * bug the injected-labels pattern exists to prevent.
 */

export interface BadgeTrackerLabels {
  heading: string;
  /** Shown when nothing is being tracked. */
  emptyTitle: string;
  emptyBody: string;
  /**
   * "2 / 3" next to the heading. A function because the separator and the order
   * are a translator's decision, and because a surface may want to hide it — the
   * kiosk passes one that returns "" until there is more than one goal.
   */
  slots: (used: number, max: number) => string;
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
  heading: "Your goals",
  emptyTitle: "No goals picked",
  emptyBody: "Pick up to three badges in the member portal and your progress shows up here.",
  slots: (used, max) => `${used} / ${max}`,
  count: (current, target, unit) => `${current} of ${target} ${unit === "days" ? "days" : "classes"}`,
  remaining: (n, unit) => `${n} more ${unit === "days" ? (n === 1 ? "day" : "days") : n === 1 ? "class" : "classes"}`,
  complete: "Done — it unlocks on your next check-in!",
  milestonePending: "Not yet — keep going!",
  manual: "Your coach awards this one by hand.",
  progressLabel: (current, target) => `${current} of ${target}`,
};

export interface BadgeTrackerProps {
  /** The tracked badges, oldest first. Empty renders the call to action. */
  tracked: readonly TrackedBadgeEntry[];
  variant?: "light" | "dark";
  labels?: Partial<BadgeTrackerLabels>;
  /**
   * Rendered next to the heading — the portal passes its picker button here.
   * Omitted on the kiosk, which is read-only (see the header).
   */
  actions?: React.ReactNode;
  /**
   * Rendered at the end of each row — the portal passes its per-goal remove
   * button. A render prop rather than an `onRemove` callback so this component
   * stays free of button markup and copy, which differ between the surfaces that
   * have controls and the one that doesn't.
   */
  rowActions?: (entry: TrackedBadgeEntry) => React.ReactNode;
  className?: string;
}

export default function BadgeTracker({
  tracked,
  variant = "light",
  labels: labelOverrides,
  actions,
  rowActions,
  className = "",
}: BadgeTrackerProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const dark = variant === "dark";

  const slotText = tracked.length > 0 ? labels.slots(tracked.length, MAX_TRACKED_BADGES) : "";

  const heading = (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div
        className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 min-w-0 ${
          dark ? "text-white/40" : "text-muted"
        }`}
      >
        <Target className="w-3.5 h-3.5 flex-none" aria-hidden="true" />
        <span className="truncate">{labels.heading}</span>
        {/* The counter is what tells a member they have room for another goal
            without opening the picker to find out. */}
        {slotText && <span className="font-mono font-normal flex-none">{slotText}</span>}
      </div>
      {actions}
    </div>
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  // Still a card rather than nothing at all: an absent tracker can't advertise
  // that the feature exists, and "pick a goal" is the whole call to action.
  if (tracked.length === 0) {
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

  return (
    <div className={className}>
      {heading}
      {/* divide-y rather than a gap: three goals in a row need a visual boundary or
          the second badge's name reads as a caption on the first one's bar. */}
      <ul className={`divide-y ${dark ? "divide-white/10" : "divide-line"}`}>
        {tracked.map((entry, i) => (
          <li key={entry.badge.id} className={i === 0 ? "pb-4" : "py-4 last:pb-0"}>
            <TrackerRow
              entry={entry}
              dark={dark}
              variant={variant}
              labels={labels}
              actions={rowActions?.(entry)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One goal: the medal, the name, and whichever of the four progress shapes it has.
 *
 * Not exported. The list is the unit both surfaces render, and a row on its own has
 * no heading, no empty state and no notion of how many goals are allowed — every
 * caller that thought it wanted a row actually wants a one-item list.
 */
function TrackerRow({
  entry,
  dark,
  variant,
  labels,
  actions,
}: {
  entry: TrackedBadgeEntry;
  dark: boolean;
  variant: "light" | "dark";
  labels: BadgeTrackerLabels;
  actions?: React.ReactNode;
}) {
  const { badge, progress } = entry;
  const pct = badgeProgressPercent(progress);

  return (
    <>
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
        <div className="min-w-0 flex-1">
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
        {/* Per-row rather than in the header, because with three goals a single
            "clear" button has no way to say WHICH one it clears. */}
        {actions && <div className="flex-none">{actions}</div>}
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
    </>
  );
}
