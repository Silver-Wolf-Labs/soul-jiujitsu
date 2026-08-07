"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { badgeIcon } from "@/lib/badges";
import BeltVisual from "@/components/ui/BeltVisual";
import { getTeamLeaderboard, getTeamActivity } from "@/lib/actions/portal";
import type { TeamMemberEntry, TeamActivityEntry } from "@/lib/supabase/types";

/**
 * The social side of the portal: who else trains here, where they are, and what
 * just happened.
 *
 * REAL TIME
 * ---------
 * Both panels refresh when anyone in the gym checks in or earns a badge. The
 * trigger is a Supabase Realtime subscription on `check_ins` and
 * `member_badges`; the payload is deliberately ignored and used only as a signal
 * to re-run the two server actions. Two reasons:
 *
 *   1. A raw INSERT payload can't be rendered. It carries member_id, not the
 *      display name, belt, level or streak — and the ranking of every other row
 *      may have changed too. Recomputing server-side is the only correct answer.
 *   2. Realtime delivers rows through RLS, which for `check_ins` means a member
 *      only sees their own. The feed's data comes from SECURITY DEFINER RPCs
 *      instead, so treating the event as a notification rather than as data
 *      keeps one source of truth for what a member is allowed to see.
 *
 * Bursts are coalesced: a class of fifteen ending at once fires fifteen events,
 * and refetching per event would mean fifteen round-trips for one visible
 * change. The debounce below collapses them into a single refresh.
 */
const REFRESH_DEBOUNCE_MS = 1200;

/**
 * Fallback poll, and it is load-bearing rather than belt-and-braces.
 *
 * Realtime only delivers for tables in the `supabase_realtime` publication, and
 * a subscription to a table that ISN'T in it still reports SUBSCRIBED and then
 * silently delivers nothing — measured against staging: 0 events for a real
 * INSERT. The migration that adds check_ins and member_badges to the publication
 * (20260810000000_realtime_team_feed.sql) has to be applied for the socket path
 * to do anything at all; until then this poll is the only thing keeping the feed
 * current, and it also covers a socket dropping on a flaky phone connection.
 */
const POLL_INTERVAL_MS = 60_000;

export default function TeamFeed({
  initialLeaderboard,
  initialActivity,
}: {
  initialLeaderboard: TeamMemberEntry[];
  initialActivity: TeamActivityEntry[];
}) {
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [activity, setActivity] = useState(initialActivity);
  const [tab, setTab] = useState<"ranking" | "activity">("ranking");

  // Held in a ref so the debounce timer survives re-renders without being part
  // of the effect's dependencies (which would tear down the subscription).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [lb, act] = await Promise.all([getTeamLeaderboard(), getTeamActivity()]);
      setLeaderboard(lb);
      setActivity(act);
    } catch {
      // Leave the last good data on screen. A failed background refresh is not
      // worth an error banner over a social panel — the next tick retries.
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("team-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "check_ins" }, scheduleRefresh)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "check_ins" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "member_badges" }, scheduleRefresh)
      .subscribe();

    const poll = setInterval(() => void refresh(), POLL_INTERVAL_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [scheduleRefresh, refresh]);

  return (
    <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-xl text-black dark:text-ink">The Team</h2>
        <span className="text-sm text-muted">
          {leaderboard.length} {leaderboard.length === 1 ? "member" : "members"}
        </span>
      </div>

      <div className="flex w-full rounded-lg bg-line/50 p-1 mb-4">
        {(["ranking", "activity"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              tab === t
                ? "bg-white dark:bg-line text-ink shadow-sm"
                : "text-ink/50 hover:text-ink"
            }`}
          >
            {t === "ranking" ? "Ranking" : "Recent"}
          </button>
        ))}
      </div>

      {tab === "ranking" ? (
        <Leaderboard rows={leaderboard} />
      ) : (
        <ActivityList rows={activity} />
      )}
    </div>
  );
}

function Leaderboard({ rows }: { rows: TeamMemberEntry[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No teammates to show yet.</p>;
  }

  return (
    <ol className="divide-y divide-line">
      {rows.map((m, i) => (
        <li
          key={m.member_id}
          className={`flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 ${
            // The viewer's own row, tinted so they can find themselves in a list
            // of fifty without counting. -mx/px keeps the tint edge-to-edge
            // inside the card's padding.
            m.is_self ? "bg-yellow-light -mx-2 px-2 rounded" : ""
          }`}
        >
          <span className="w-6 shrink-0 text-center text-xs font-mono text-muted">{i + 1}</span>

          {/* BeltVisual falls back to white for an unrecognised colour on its
              own, so the raw column value goes straight in. */}
          <BeltVisual belt={m.belt} stripes={m.stripes} className="w-8 shrink-0" />

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink truncate">
              {m.display_name}
              {m.is_self && <span className="ml-1.5 text-[11px] font-normal text-muted">(you)</span>}
            </span>
            <span className="block text-xs text-muted">
              Level {m.level} · {m.xp_total.toLocaleString()} XP
              {m.badges_earned > 0 && ` · ${m.badges_earned} ${m.badges_earned === 1 ? "badge" : "badges"}`}
            </span>
          </span>

          {m.streak_days > 0 && (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-orange"
              title={`Longest streak: ${m.longest_streak} days`}
            >
              <Flame className="w-3.5 h-3.5" aria-hidden="true" />
              {m.streak_days}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function ActivityList({ rows }: { rows: TeamActivityEntry[] }) {
  // Null until after mount, which is what suppresses the relative timestamps on
  // the server pass: "5m ago" computed during SSR is already wrong by the time
  // the HTML arrives, and rendering a different string on hydration is a
  // mismatch. Re-stamped every 60s so "just now" doesn't linger for an hour on a
  // tab left open.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nothing yet — be the first to train today.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((a, i) => {
        const Icon = a.kind === "badge" ? badgeIcon(a.icon ?? "") : CalendarCheck;
        return (
          <li
            key={`${a.kind}-${a.member_id}-${a.occurred_at}-${i}`}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                a.kind === "badge" ? "bg-yellow-light text-yellow-dark" : "bg-paper text-muted"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink truncate">
                <span className="font-semibold">
                  {a.is_self ? "You" : a.display_name}
                </span>{" "}
                {a.kind === "badge" ? "earned" : a.is_self ? "checked into" : "trained"}{" "}
                <span className="font-semibold">{a.title}</span>
              </span>
              {/* &nbsp; holds the line's height before the first client tick so
                  the list doesn't reflow a pixel on hydration. */}
              <span className="block text-xs text-muted">
                {now === null ? " " : relativeTime(a.occurred_at, now)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "3h ago". Coarse on purpose — the feed is ambient, not a timestamp log.
 *
 * `now` is passed in rather than read from Date.now() inside, so the whole list
 * is stamped against one instant. Read per row it would also differ between the
 * server render and the hydrating client, which React reports as a hydration
 * mismatch for every row that happens to tick over between the two.
 */
function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((now - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
