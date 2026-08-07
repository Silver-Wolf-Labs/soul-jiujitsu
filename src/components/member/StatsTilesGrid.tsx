"use client";

import { useState } from "react";
import type { KioskMemberStats, GymRankings } from "@/lib/actions/check-ins";
import { plural, formatRankDisplay } from "@/lib/stats-display";

// ── Shared stat metadata ──────────────────────────────────────────────────────
// Single source of truth for the four stat keys used by both "You" and
// "vs Gym" tabs. Eliminates the duplicated label strings.

type StatKey = "month" | "streak" | "alltime" | "week";

const STAT_LABELS: Record<StatKey, string> = {
  month:   "THIS MONTH",
  // "WEEK STREAK", not "STREAK": the portal also shows a training-DAY streak
  // (StreakCard), and two tiles both labelled "STREAK" showing different
  // numbers reads as a bug. This one counts consecutive weeks with >= 1 class.
  streak:  "WEEK STREAK",
  alltime: "ALL-TIME",
  week:    "THIS WEEK",
};

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
}: {
  active: "you" | "gym";
  onChange: (v: "you" | "gym") => void;
  variant: "light" | "dark";
}) {
  const wrapCls =
    variant === "dark"
      ? "flex w-full rounded-xl bg-white/5 p-1 mb-3"
      : "flex w-full rounded-lg bg-line/50 p-1 mb-3";

  const activeCls =
    variant === "dark"
      ? "bg-white/15 text-white"
      : "bg-white text-ink shadow-sm";

  const inactiveCls =
    variant === "dark"
      ? "text-white/35 hover:text-white/60"
      : "text-ink/50 hover:text-ink";

  return (
    <div className={wrapCls}>
      {(["you", "gym"] as const).map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize ${
            active === tab ? activeCls : inactiveCls
          }`}
        >
          {tab === "you" ? "You" : "vs Gym"}
        </button>
      ))}
    </div>
  );
}

// ── "You" tab stat config ─────────────────────────────────────────────────────

interface YouStat {
  key: StatKey;
  value: (s: KioskMemberStats) => string;
  descriptor: (s: KioskMemberStats) => string;
  highlight?: (s: KioskMemberStats) => boolean;
  dim?: (s: KioskMemberStats) => boolean;
}

const YOU_STATS: YouStat[] = [
  {
    key: "month",
    value: s => String(s.classes_this_month),
    descriptor: s => s.classes_this_month === 0 ? "train today!" : plural(s.classes_this_month, "class"),
    highlight: s => s.classes_this_month > 0,
    dim: s => s.classes_this_month === 0,
  },
  {
    key: "streak",
    value: s => String(s.week_streak),
    descriptor: s => s.week_streak === 0 ? "start one!" : plural(s.week_streak, "week"),
    highlight: s => s.week_streak >= 4,
    dim: s => s.week_streak === 0,
  },
  {
    key: "alltime",
    value: s => String(s.all_time_classes),
    descriptor: s => plural(s.all_time_classes, "class"),
  },
  {
    key: "week",
    value: s => String(s.classes_this_week),
    descriptor: s => s.avg_per_week > 0 ? `avg ${s.avg_per_week}/wk` : "let\u2019s go!",
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
  className = "",
}: StatsTilesGridProps) {
  const showTabs = gymRankings !== undefined;
  const [view, setView] = useState<"you" | "gym">("you");

  if (!memberStats) {
    return (
      <div className={className}>
        {showTabs && <TabToggle active={view} onChange={setView} variant={variant} />}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} variant={variant} />)}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {showTabs && <TabToggle active={view} onChange={setView} variant={variant} />}

      <div className="grid grid-cols-2 gap-3">
        {(!showTabs || view === "you") &&
          YOU_STATS.map(cfg => (
            <StatCard
              key={cfg.key}
              number={cfg.value(memberStats)}
              label={STAT_LABELS[cfg.key]}
              descriptor={cfg.descriptor(memberStats)}
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
                return (
                  <StatCard
                    key={key}
                    number={r.value}
                    label={STAT_LABELS[key]}
                    descriptor={r.isUnranked ? "train to rank!" : `of ${plural(stat.total, "member")}`}
                    highlight={r.isHighlighted}
                    dim={r.isUnranked}
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
