"use client";

import { useState } from "react";
import type { KioskMemberStats, GymRankings } from "@/lib/actions/check-ins";
import { plural, ordinal, formatRankDisplay } from "@/lib/stats-display";

// ── Shared stat metadata ──────────────────────────────────────────────────────
// Single source of truth for the four stat keys used by both "You" and
// "vs Gym" tabs. Eliminates the duplicated label strings.

type StatKey = "month" | "streak" | "alltime" | "week";

// ── Copy ──────────────────────────────────────────────────────────────────────
//
// Injected rather than looked up: this grid renders on the kiosk (English, on a
// wall-mounted tablet, not yet migrated) as well as in the Spanish member portal.
// Calling useTranslations here would put Spanish tiles on the kiosk. The defaults
// are the English strings this file used to hold, so the kiosk is untouched.
//
// The descriptors are functions because they are count-sensitive: Spanish plural
// rules aren't "add an s", so the portal passes ICU-formatted versions from the
// catalogue rather than a template this file could interpolate.

export interface StatsTilesLabels {
  tabYou: string;
  tabGym: string;
  month: string;
  /** "WEEK STREAK", not "STREAK": the portal also shows a training-DAY streak
   *  (StreakCard), and two tiles both labelled "STREAK" showing different
   *  numbers reads as a bug. This one counts consecutive weeks with >= 1 class. */
  streak: string;
  alltime: string;
  week: string;
  classes: (count: number) => string;
  weeks: (count: number) => string;
  /** Shown under a zero in the month tile. */
  trainToday: string;
  /** Shown under a zero week-streak. */
  startOne: string;
  /** Shown in the week tile when there is no 4-week average yet. */
  letsGo: string;
  avgPerWeek: (avg: number) => string;
  /** Shown when the member has no rank in a gym tile. */
  trainToRank: string;
  ofMembers: (count: number) => string;
  /**
   * The rank itself, for a gym under 50 members. English has an ordinal suffix
   * system ("3rd") that Spanish has no equivalent for, so this is a function over
   * the raw rank rather than a string this file could format — see RankDisplay.
   */
  rankPosition: (rank: number) => string;
  /** The rank as a percentile, for a gym of 50 or more. */
  rankPercentile: (percent: number) => string;
}

const DEFAULT_LABELS: StatsTilesLabels = {
  tabYou: "You",
  tabGym: "vs Gym",
  month: "THIS MONTH",
  streak: "WEEK STREAK",
  alltime: "ALL-TIME",
  week: "THIS WEEK",
  classes: (n) => plural(n, "class"),
  weeks: (n) => plural(n, "week"),
  trainToday: "train today!",
  startOne: "start one!",
  letsGo: "let’s go!",
  avgPerWeek: (avg) => `avg ${avg}/wk`,
  trainToRank: "train to rank!",
  ofMembers: (n) => `of ${plural(n, "member")}`,
  rankPosition: (rank) => ordinal(rank),
  rankPercentile: (percent) => `Top ${percent}%`,
};

// The four StatKey values are also the label keys, so a tile's heading is just
// labels[key] — no lookup table.

// ── StatCard ──────────────────────────────────────────────────────────────────

interface StatCardProps {
  number: string;
  label: string;
  descriptor: string;
  highlight: boolean;
  dim?: boolean;
  variant: "light" | "dark";
}

/**
 * Single stat tile.
 *
 * variant="light" — off-white background, dark text (portal / admin)
 * variant="dark"  — semi-transparent overlay (kiosk dark background)
 */
export function StatCard({
  number,
  label,
  descriptor,
  highlight,
  dim = false,
  variant,
}: StatCardProps) {
  if (variant === "dark") {
    return (
      <div className="bg-white/5 rounded-2xl px-4 py-4 text-center">
        <div
          className={`font-display text-3xl ${
            highlight ? "text-yellow" : dim ? "text-white/30" : "text-white"
          }`}
        >
          {number}
        </div>
        <div className="text-white/40 text-[10px] font-mono tracking-[0.15em] uppercase mt-1">
          {label}
        </div>
        <div className="text-xs text-white/25 mt-1 h-4 leading-tight">{descriptor}</div>
      </div>
    );
  }

  return (
    <div className="bg-off-white rounded-xl px-4 py-4 text-center">
      <div
        className={`font-display text-2xl ${
          highlight ? "text-blue" : dim ? "text-muted/40" : "text-ink"
        }`}
      >
        {number}
      </div>
      <div className="text-muted text-[10px] font-mono tracking-[0.15em] uppercase mt-1">
        {label}
      </div>
      <div className="text-xs text-muted/70 mt-1 h-4 leading-tight">{descriptor}</div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function SkeletonCard({ variant }: { variant: "light" | "dark" }) {
  const base =
    variant === "dark"
      ? "bg-white/5 rounded-2xl px-4 py-4 text-center"
      : "bg-off-white rounded-xl px-4 py-4 text-center";
  const pulse = variant === "dark" ? "bg-white/10" : "bg-line";

  return (
    <div className={base}>
      <div className={`mx-auto w-10 h-7 ${pulse} rounded animate-pulse mb-2`} />
      <div className={`mx-auto w-16 h-2 ${pulse} rounded animate-pulse mb-2`} />
      <div className={`mx-auto w-14 h-2 opacity-50 ${pulse} rounded animate-pulse`} />
    </div>
  );
}

// ── Tab toggle ────────────────────────────────────────────────────────────────

function TabToggle({
  active,
  onChange,
  variant,
  labels,
}: {
  active: "you" | "gym";
  onChange: (v: "you" | "gym") => void;
  variant: "light" | "dark";
  labels: StatsTilesLabels;
}) {
  const wrapCls =
    variant === "dark"
      ? "flex w-full rounded-xl bg-white/5 p-1 mb-3"
      : "flex w-full rounded-lg bg-line/50 p-1 mb-3";

  // The light variant's active pill needs a dark: partner. `variant` is about
  // which *surface* the grid sits on (kiosk overlay vs card), which is decided by
  // the caller; the portal passes "light" and then themes the card itself, so the
  // pill has to follow the theme rather than the variant.
  const activeCls =
    variant === "dark"
      ? "bg-white/15 text-white"
      : "bg-white dark:bg-line text-ink shadow-sm";

  const inactiveCls =
    variant === "dark"
      ? "text-white/35 hover:text-white/60"
      : "text-ink/50 hover:text-ink";

  return (
    <div className={wrapCls}>
      {/* `capitalize` dropped from the button: it upper-cased every word, so the
          kiosk's second tab actually read "Vs Gym". The labels now carry their own
          casing, which is the only way "vs. gym" can stay lower-case in Spanish. */}
      {(["you", "gym"] as const).map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            active === tab ? activeCls : inactiveCls
          }`}
        >
          {tab === "you" ? labels.tabYou : labels.tabGym}
        </button>
      ))}
    </div>
  );
}

// ── "You" tab stat config ─────────────────────────────────────────────────────

interface YouStat {
  key: StatKey;
  value: (s: KioskMemberStats) => string;
  descriptor: (s: KioskMemberStats, l: StatsTilesLabels) => string;
  highlight?: (s: KioskMemberStats) => boolean;
  dim?: (s: KioskMemberStats) => boolean;
}

const YOU_STATS: YouStat[] = [
  {
    key: "month",
    value: s => String(s.classes_this_month),
    descriptor: (s, l) => s.classes_this_month === 0 ? l.trainToday : l.classes(s.classes_this_month),
    highlight: s => s.classes_this_month > 0,
    dim: s => s.classes_this_month === 0,
  },
  {
    key: "streak",
    value: s => String(s.week_streak),
    descriptor: (s, l) => s.week_streak === 0 ? l.startOne : l.weeks(s.week_streak),
    highlight: s => s.week_streak >= 4,
    dim: s => s.week_streak === 0,
  },
  {
    key: "alltime",
    value: s => String(s.all_time_classes),
    descriptor: (s, l) => l.classes(s.all_time_classes),
  },
  {
    key: "week",
    value: s => String(s.classes_this_week),
    descriptor: (s, l) => s.avg_per_week > 0 ? l.avgPerWeek(s.avg_per_week) : l.letsGo,
    dim: s => s.classes_this_week === 0,
  },
];

const GYM_STAT_ORDER: StatKey[] = ["month", "streak", "alltime", "week"];

// ── StatsTilesGrid ────────────────────────────────────────────────────────────

export interface StatsTilesGridProps {
  /** Member stats. `null` shows a full loading skeleton. */
  memberStats: KioskMemberStats | null;
  /**
   * Gym rankings for the "vs Gym" tab.
   * `undefined` — hide the tab toggle (stats-only mode).
   * `null` — show the tab toggle with a skeleton in the gym tab (still loading).
   */
  gymRankings?: GymRankings | null;
  /**
   * Visual context.
   * "light" — off-white tiles (portal, admin).
   * "dark"  — translucent tiles (kiosk).
   */
  variant?: "light" | "dark";
  /** Overrides for the rendered strings, merged over the English defaults. */
  labels?: Partial<StatsTilesLabels>;
  className?: string;
}

/**
 * 2×2 stat grid with optional "You" / "vs Gym" tab toggle.
 * Omit `gymRankings` (or pass `undefined`) to hide tabs and show "You" stats only.
 */
export default function StatsTilesGrid({
  memberStats,
  gymRankings,
  variant = "light",
  labels: labelOverrides,
  className = "",
}: StatsTilesGridProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const showTabs = gymRankings !== undefined;
  const [view, setView] = useState<"you" | "gym">("you");

  if (!memberStats) {
    return (
      <div className={className}>
        {showTabs && <TabToggle active={view} onChange={setView} variant={variant} labels={labels} />}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} variant={variant} />)}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {showTabs && <TabToggle active={view} onChange={setView} variant={variant} labels={labels} />}

      <div className="grid grid-cols-2 gap-3">
        {(!showTabs || view === "you") &&
          YOU_STATS.map(cfg => (
            <StatCard
              key={cfg.key}
              number={cfg.value(memberStats)}
              label={labels[cfg.key]}
              descriptor={cfg.descriptor(memberStats, labels)}
              highlight={cfg.highlight?.(memberStats) ?? false}
              dim={cfg.dim?.(memberStats) ?? false}
              variant={variant}
            />
          ))}

        {showTabs && view === "gym" && (
          gymRankings
            ? GYM_STAT_ORDER.map(key => {
                const stat = gymRankings[key];
                const r = formatRankDisplay(stat.rank, stat.total);
                // The em dash is the absence of a number rather than a word, so
                // it stays here; the other two branches are language.
                const number =
                  r.kind === "unranked"
                    ? "—"
                    : r.kind === "position"
                    ? labels.rankPosition(r.rank)
                    : labels.rankPercentile(r.percent);
                return (
                  <StatCard
                    key={key}
                    number={number}
                    label={labels[key]}
                    descriptor={r.kind === "unranked" ? labels.trainToRank : labels.ofMembers(stat.total)}
                    highlight={r.kind !== "unranked" && r.isHighlighted}
                    dim={r.kind === "unranked"}
                    variant={variant}
                  />
                );
              })
            : [0, 1, 2, 3].map(i => <SkeletonCard key={i} variant={variant} />)
        )}
      </div>
    </div>
  );
}
