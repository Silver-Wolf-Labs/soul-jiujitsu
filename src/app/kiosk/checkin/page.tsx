"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  lookupMemberByPhone,
  getTodaysClasses,
  getMemberTodayCheckIns,
  recordCheckIn,
  undoKioskCheckIn,
  lockKiosk,
  getKioskMemberStats,
  getGymRankings,
  getKioskUnlockStatus,
  getKioskMemberBadges,
  getKioskTrackedBadges,
  type KioskMember,
  type KioskClass,
  type KioskMemberStats,
  type GymRankings,
  type AwardedBadge,
  type KioskBadges,
} from "@/lib/actions/check-ins";
import { TIER_STYLES } from "@/lib/badges";
import type { TrackedBadgeEntry } from "@/lib/badge-progress";
import BeltVisual from "@/components/ui/BeltVisual";
import StatsTilesGrid from "@/components/member/StatsTilesGrid";
import { BadgeMedal } from "@/components/member/BadgeMedal";
import KioskBadgePanel from "@/components/kiosk/KioskBadgePanel";
import Spinner from "@/components/ui/Spinner";
import PinPad from "@/components/kiosk/PinPad";
import { useGymProfile } from "@/lib/gym-profile-context";
import { useKioskUi } from "@/lib/kiosk-ui-context";
import { PIN_MASK_DELAY_MS } from "@/lib/kiosk-ui-config";
import { checkRestrictions as checkRestrictionsImpl, memberAge as memberAgeImpl } from "@/lib/kiosk/check-restrictions";

const RESET_DELAY_SUCCESS_MS = 5000;
const RESET_DELAY_UNDONE_MS  = 3000;
/** Longer dwell when a badge was just unlocked — 5s isn't enough time to read
 *  the badge name and description, and this is the moment the member cares
 *  about. Applies only when there's actually a badge to show. */
const RESET_DELAY_BADGE_MS   = 9000;

/** Thin wrapper that adapts the KioskMember type to the pure helper's
 *  minimal `RestrictionMember` shape. Keeping this in the page file
 *  means `checkRestrictions` can be unit-tested without importing
 *  kiosk-specific types. */
function memberAge(m: KioskMember): number | null {
  return memberAgeImpl(m);
}

function checkRestrictions(cls: KioskClass, member: KioskMember): string | null {
  return checkRestrictionsImpl(cls.audiences ?? [], member);
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function initials(m: KioskMember) {
  return `${m.first_name[0]}${m.last_name[0]}`.toUpperCase();
}

function gymTenure(joinedAt: string | null): string | null {
  if (!joinedAt) return null;
  const start = new Date(joinedAt);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0 && months === 0) return "Less than a month";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  return parts.join(", ");
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-right">
      <div className="font-display text-2xl text-white">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="text-white/40 text-xs font-mono tracking-wide">
        {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
      </div>
    </div>
  );
}

type Step = "lookup" | "confirm" | "profile" | "class" | "success" | "undone" | "error";

/**
 * The two halves of the profile step.
 *
 * A tab rather than a longer card: the profile step is already at the limit of a
 * 768px-tall tablet — belt, four stat tiles, last class and the yellow Check In
 * button, which must stay above the fold or the device's primary action vanishes.
 * Appending a badge wall to that would push the button off screen on exactly the
 * hardware this runs on. So badges get their own surface, and "Check In" stays put
 * underneath both.
 */
type ProfileTab = "stats" | "badges";


export default function KioskCheckinPage() {
  const router = useRouter();
  const profile = useGymProfile();
  const { pinPrivacyMask } = useKioskUi();
  const [code, setCode]           = useState("");
  const [step, setStep]           = useState<Step>("lookup");
  const [matches, setMatches]     = useState<KioskMember[]>([]);
  const [selected, setSelected]   = useState<KioskMember | null>(null);
  const [classes, setClasses]     = useState<KioskClass[]>([]);
  const [pickedClass, setPickedClass] = useState<KioskClass | null>(null);
  const [restrictionWarning, setRestrictionWarning] = useState<string | null>(null);
  const [memberStats, setMemberStats] = useState<KioskMemberStats | null>(null);
  const [gymRankings, setGymRankings] = useState<GymRankings | null>(null);
  const [todayCheckedIn, setTodayCheckedIn] = useState<string[]>([]);
  // ── Badges tab ──
  // Loaded lazily, the first time the member opens the tab: 30 catalogue rows plus
  // a progress RPC is real latency, and paying it on every profile view would slow
  // down the check-in that is the whole point of the device. `badgesLoading`
  // distinguishes "not asked yet" from "asked and empty".
  const [profileTab, setProfileTab] = useState<ProfileTab>("stats");
  const [badges, setBadges]       = useState<KioskBadges | null>(null);
  const [trackedBadges, setTrackedBadges] = useState<TrackedBadgeEntry[] | null>(null);
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [loadingMemberId, setLoadingMemberId] = useState<number | null>(null);
  const [locking, setLocking]     = useState(false);
  const [msg, setMsg]             = useState("");
  const [lastCheckInId, setLastCheckInId] = useState<number | null>(null);
  /** Badges unlocked by the check-in just recorded — shown on the success screen. */
  const [awardedBadges, setAwardedBadges] = useState<AwardedBadge[]>([]);
  const [undoing, setUndoing]     = useState(false);
  // Ticks down while the success/undone screens auto-reset — purely cosmetic.
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);

  // Ref for the class-list scroll container — used to center the closest class.
  const classListRef = useRef<HTMLDivElement>(null);

  // Guard: decide whether this device is allowed past the PIN pad.
  //
  //   strict mode → every refresh must re-enter the PIN. We consume a
  //     one-shot sessionStorage flag written by /kiosk on unlock; its
  //     absence on refresh = kick back to the PIN pad.
  //
  //   grace mode (4h/8h/16h) → the server-issued kiosk_grace_until cookie
  //     is the source of truth. Refreshes inside the window render
  //     immediately, no sessionStorage dance.
  //
  // Ref prevents React 18 strict-mode double-fire from consuming the
  // strict-mode flag twice on the same mount.
  const guardRan = useRef(false);
  useEffect(() => {
    if (guardRan.current) return;
    guardRan.current = true;
    let cancelled = false;

    (async () => {
      const status = await getKioskUnlockStatus();
      if (cancelled) return;

      if (!status.cookieActive) {
        router.replace("/kiosk");
        return;
      }

      if (status.mode === "grace") {
        // Grace cookie honors the refresh — leave sessionStorage alone so
        // a future policy flip to strict doesn't trip on stale flags.
        return;
      }

      // Strict: the unlock page sets kiosk_active in sessionStorage. Consume
      // it, or redirect if it's already been consumed (= this is a refresh).
      if (sessionStorage.getItem("kiosk_active")) {
        sessionStorage.removeItem("kiosk_active");
      } else {
        router.replace("/kiosk");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load today's classes on mount
  useEffect(() => {
    getTodaysClasses().then(setClasses).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    setCode(""); setStep("lookup"); setMatches([]);
    setSelected(null); setPickedClass(null); setRestrictionWarning(null); setBusy(false); setLoadingMemberId(null); setMsg("");
    setMemberStats(null); setGymRankings(null); setTodayCheckedIn([]);
    setLastCheckInId(null); setUndoing(false); setAwardedBadges([]);
    // Badge state is per-member and this is a SHARED device: leaving it behind
    // would show the next person in line the previous member's badges and goal.
    setProfileTab("stats"); setBadges(null); setTrackedBadges(null); setBadgesLoading(false);
  }, []);

  // Auto-reset after success/undone. Undone gets a shorter dwell because
  // the member has already seen the "removed" confirmation and there's
  // nothing else to do from that screen. Also ticks a visible countdown
  // so the member sees "Resetting in 4s… 3s… 2s…".
  useEffect(() => {
    if (step !== "success" && step !== "undone") {
      setResetCountdown(null);
      return;
    }
    const delay =
      step === "undone"        ? RESET_DELAY_UNDONE_MS
      : awardedBadges.length > 0 ? RESET_DELAY_BADGE_MS
      :                           RESET_DELAY_SUCCESS_MS;
    const totalSec = Math.ceil(delay / 1000);
    setResetCountdown(totalSec);

    const tickId = setInterval(() => {
      setResetCountdown(n => (n == null ? null : Math.max(n - 1, 0)));
    }, 1000);
    const resetId = setTimeout(reset, delay);
    return () => {
      clearInterval(tickId);
      clearTimeout(resetId);
    };
  }, [step, reset, awardedBadges.length]);

  // When the class list appears, smoothly scroll the class closest to the
  // current local time into the center of the scroll container. Two rAFs
  // let the staggered entrance animation start before the scroll kicks in,
  // so the motion reads as one continuous reveal rather than two jumps.
  useEffect(() => {
    if (step !== "class" || classes.length === 0) return;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let closestIdx = 0;
    let closestDiff = Infinity;
    classes.forEach((c, i) => {
      const [h, m] = c.start_time.split(":").map(Number);
      const diff = Math.abs(h * 60 + m - nowMinutes);
      if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const items = classListRef.current?.querySelectorAll<HTMLElement>("[data-class-item]");
        items?.[closestIdx]?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    });
  }, [step, classes]);

  function handleDigit(d: string) {
    if (busy) return;
    if (d === "⌫") { setCode(c => c.slice(0, -1)); return; }
    if (code.length >= 4) return;
    const next = code + d;
    setCode(next);
    if (next.length === 4) handleLookup(next);
  }

  async function handleLookup(c: string) {
    setBusy(true);
    try {
      const { members, error } = await lookupMemberByPhone(c);
      if (error) { setMsg(error); setCode(""); setBusy(false); return; }
      if (members.length === 0) {
        setMsg("No active member found. Ask staff for help.");
        setCode("");
        setBusy(false);
        return;
      }
      setMatches(members);
      setStep("confirm");
    } catch {
      setMsg("Something went wrong. Please try again.");
      setCode("");
    }
    setBusy(false);
  }

  async function handleSelectMember(m: KioskMember) {
    setSelected(m);
    setBusy(true);
    setLoadingMemberId(m.id);
    // Fire gym rankings in the background — don't block the profile transition
    getGymRankings(m.id).then(setGymRankings).catch(err => {
      console.warn("[kiosk] Failed to load gym rankings:", err);
    });
    try {
      const [stats, checkedIn] = await Promise.all([
        getKioskMemberStats(m.id),
        getMemberTodayCheckIns(m.id),
      ]);
      setMemberStats(stats);
      setTodayCheckedIn(checkedIn);
    } catch (err) {
      // Non-fatal: show profile step without stats
      console.warn("[kiosk] Failed to load member stats/check-ins:", err);
      setMemberStats(null);
      setTodayCheckedIn([]);
    }
    setBusy(false);
    setLoadingMemberId(null);
    setStep("profile");
  }

  function handleProfileContinue() {
    if (classes.length === 1) setPickedClass(classes[0]);
    setStep("class");
  }

  /**
   * Opens the badges tab, fetching on first open only.
   *
   * Failure is silent and non-fatal by design: the panel renders its own empty
   * state, and a badge wall that didn't load must never stop somebody checking in.
   * Guarded on `badges` rather than a "fetched" flag so a failed load retries when
   * the member taps back — the retry is free and the alternative is a tab that is
   * permanently blank until the device is reset.
   */
  async function handleOpenBadges() {
    setProfileTab("badges");
    if (!selected || badges || badgesLoading) return;
    setBadgesLoading(true);
    try {
      const [b, tracked] = await Promise.all([
        getKioskMemberBadges(selected.id),
        getKioskTrackedBadges(selected.id),
      ]);
      setBadges(b);
      setTrackedBadges(tracked);
    } catch (err) {
      console.warn("[kiosk] Failed to load badges:", err);
      setBadges({ earned: [], locked: [] });
    }
    setBadgesLoading(false);
  }

  async function handleCheckIn() {
    if (!selected || !pickedClass) return;

    // Check age/gender/invite restrictions — show warning if mismatched
    if (!restrictionWarning) {
      const label = checkRestrictions(pickedClass, selected);
      if (label) {
        setRestrictionWarning(label);
        return; // show dialog, user must confirm or cancel
      }
    }
    setRestrictionWarning(null);

    setBusy(true);
    const result = await recordCheckIn(selected.id, pickedClass.name, pickedClass.id);
    if (result.ok) {
      setLastCheckInId(result.checkInId ?? null);
      setAwardedBadges(result.awardedBadges ?? []);
      setStep("success");
    } else {
      setMsg(result.error ?? "Check-in failed. Please see staff.");
      setStep("error");
    }
    setBusy(false);
  }

  /** Success-screen self-undo — "oops, wrong class / wrong person". */
  async function handleUndo() {
    if (!selected || lastCheckInId == null || undoing) return;
    setUndoing(true);
    const result = await undoKioskCheckIn(selected.id, lastCheckInId);
    if (result.ok) {
      // The undo cascades away this check-in's XP, so stop advertising the
      // badges it unlocked — and drop back to the short "undone" dwell.
      setAwardedBadges([]);
      setStep("undone");
    } else {
      setMsg(result.error ?? "Couldn't undo. Please ask staff.");
      setStep("error");
    }
    setUndoing(false);
  }

  async function handleLock() {
    setLocking(true);
    lockKiosk(); // fire-and-forget — cookie is deleted server-side instantly
    router.push("/kiosk");
  }

  return (
    // h-full inherits from the layout's h-[100dvh] — this div must never scroll.
    <div className="h-full flex flex-col select-none">
      {/* ── Header — always visible, never scrolls ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 md:px-8 py-3 md:py-4 border-b border-white/[0.06]">
        <div>
          <div className="font-display text-lg md:text-xl text-white">
            {profile.logoText}<span className="text-yellow">{profile.logoDot}</span>{profile.cityName}
          </div>
          <div className="text-white/30 text-[11px] font-mono tracking-widest uppercase">Check In</div>
        </div>
        <div className="flex items-center gap-4">
          {/* Mobile/tablet Lock lives here when the sidebar is hidden (<lg). */}
          <button
            onClick={handleLock}
            disabled={locking}
            className="lg:hidden text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors tracking-widest uppercase"
          >
            {locking ? <Spinner size="sm" delay={false} className="text-white/30" /> : "Lock"}
          </button>
          <Clock />
        </div>
      </header>

      {/* ── Body row — fills remaining viewport height, no overflow ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar — scrolls internally; Lock is always pinned to the bottom.
            Hidden below `lg` (1024px) so it doesn't crowd the centered main
            flow on portrait tablets and smaller landscape tablets. On those
            viewports the lock button in the header takes over. */}
        <aside className="hidden lg:flex flex-col w-52 flex-shrink-0 border-r border-white/[0.06]">
          <div className="flex-1 min-h-0 overflow-y-auto py-6 px-4">
            <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/25 mb-4">Today</p>
            {classes.length === 0 ? (
              <p className="text-white/20 text-xs">No classes today</p>
            ) : (
              <div className="space-y-1">
                {classes.map(c => {
                  const now = new Date();
                  const [sh, sm] = c.start_time.split(":").map(Number);
                  const slotMinutes = sh * 60 + sm;
                  const nowMinutes = now.getHours() * 60 + now.getMinutes();
                  const isPast = slotMinutes < nowMinutes - 90;
                  const isCurrent = Math.abs(slotMinutes - nowMinutes) <= 30;
                  return (
                    <div
                      key={c.id ?? c.name}
                      className={`px-3 py-2 rounded-lg text-xs ${
                        isCurrent
                          ? "bg-yellow/20 text-yellow font-semibold"
                          : isPast
                          ? "text-white/20"
                          : "text-white/50"
                      }`}
                    >
                      <div className="font-mono text-[10px]">{formatTime(c.start_time)}</div>
                      <div className="mt-0.5 leading-tight">{c.name}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Lock always visible — not absolutely positioned so it can't be scrolled away */}
          <div className="flex-shrink-0 px-4 pb-6 pt-2">
            <button
              onClick={handleLock}
              disabled={locking}
              className="text-[10px] font-mono text-white/15 hover:text-white/40 transition-colors tracking-widest uppercase"
            >
              {locking ? <Spinner size="sm" delay={false} className="text-white/20" /> : "Lock"}
            </button>
          </div>
        </aside>

        {/* ── Main — each step owns its own layout ── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* LOOKUP — centered in the main area, brand anchored above the greeting. */}
          {step === "lookup" && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 overflow-hidden">
              <div className="w-full max-w-xs">
                <PinPad
                  code={code}
                  onDigit={handleDigit}
                  busy={busy}
                  error={msg}
                  privacyMask={pinPrivacyMask}
                  maskDelayMs={PIN_MASK_DELAY_MS}
                  header={
                    <div className="text-center mb-6">
                      <div className="font-display text-3xl text-white tracking-wide">
                        {profile.logoText}
                        <span className="text-yellow">{profile.logoDot}</span>
                        {" "}{profile.cityName}
                      </div>
                      <h1 className="text-xl font-display text-white mt-4 mb-1">Welcome!</h1>
                      <p className="text-white/40 text-sm">Enter the last 4 digits of your phone</p>
                    </div>
                  }
                />
              </div>
            </div>
          )}

          {/* CONFIRM — centered */}
          {step === "confirm" && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 overflow-hidden">
              <div className="w-full max-w-sm flex flex-col items-center">
                <h1 className="text-xl font-display text-white mb-1">Who are you?</h1>
                <p className="text-white/40 text-sm mb-6">Tap your name to continue</p>
                <div className="space-y-2.5 w-full">
                  {matches.map(m => {
                    const lastNames = matches.map(x => x.last_name.toLowerCase());
                    const duplicateLastName = lastNames.filter(n => n === m.last_name.toLowerCase()).length > 1;
                    const displayName = duplicateLastName
                      ? `${m.first_name} ${m.last_name}`
                      : m.last_name;
                    const isLoading = loadingMemberId === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectMember(m)}
                        disabled={busy}
                        className={`w-full flex items-center gap-4 bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors rounded-2xl px-5 py-4 ${busy && !isLoading ? "opacity-40" : ""}`}
                      >
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center font-display text-lg text-white flex-shrink-0">
                          {isLoading ? <Spinner size="sm" delay={false} className="text-white/50" /> : initials(m)}
                        </div>
                        <div className="text-left">
                          <div className="text-white font-semibold">{displayName}</div>
                          <div className="text-white/30 text-xs mt-0.5">{m.total_check_ins} classes attended</div>
                        </div>
                      </button>
                    );
                  })}
                  <button onClick={reset} className="w-full text-center text-white/30 hover:text-white/60 text-sm py-3 transition-colors">
                    Not here — try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PROFILE — centered; everything must fit the viewport, no scroll.
              Tighter margins across the board so the yellow primary button
              never lands under the tablet fold. */}
          {step === "profile" && selected && (
            <div className="flex-1 flex flex-col items-center px-4 md:px-8 py-3 overflow-hidden">
              {/* Push/pull column: identity and the Check In button are pinned, only
                  the middle section changes with the tab. `justify-center` on the
                  stats tab preserves the centred card this step has always been;
                  the badges tab fills instead, because its content scrolls.
                  Wider on the badges tab — 3 medal columns want more than 24rem. */}
              <div
                className={`w-full flex flex-col flex-1 min-h-0 items-center ${
                  profileTab === "badges" ? "max-w-md" : "max-w-sm justify-center"
                }`}
              >
                <div className="flex-shrink-0 flex flex-col items-center w-full">
                  {/* Avatar — slightly smaller than before so the whole card fits 768px tall. */}
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center font-display text-2xl text-white mb-2">
                    {initials(selected)}
                  </div>
                  <h1 className="text-xl md:text-2xl font-display text-white mb-0.5">
                    {selected.first_name} {selected.last_name}
                  </h1>
                </div>

                {/* Tab toggle — `py-3` rather than the portal's `py-1.5`: this is a
                    wall-mounted touchscreen, so the targets are thumb-sized. */}
                <div className="flex-shrink-0 flex w-full rounded-xl bg-white/5 p-1 mt-3 mb-3">
                  {([
                    { id: "stats" as const,  label: "Stats" },
                    { id: "badges" as const, label: "Badges" },
                  ]).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => (tab.id === "badges" ? handleOpenBadges() : setProfileTab("stats"))}
                      className={`flex-1 py-3 rounded-lg text-base font-semibold transition-all ${
                        profileTab === tab.id
                          ? "bg-white/15 text-white"
                          : "text-white/35 hover:text-white/60"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {profileTab === "stats" && (
                  <>
                    {/* Belt */}
                    {memberStats && (
                      <div className="w-full mb-3 px-4">
                        <BeltVisual
                          belt={memberStats.belt ?? "white"}
                          stripes={memberStats.stripes ?? 0}
                          className="w-full max-w-[15rem] mx-auto"
                          backdrop
                        />
                        <p className="text-center text-white/35 text-[11px] mt-1.5 capitalize tracking-wide">
                          {memberStats.belt} belt
                          {memberStats.stripes > 0 && ` · ${memberStats.stripes} ${memberStats.stripes === 1 ? "stripe" : "stripes"}`}
                        </p>
                        {gymTenure(memberStats.joined_at) && (
                          <p className="text-center text-white/25 text-[11px] mt-0.5 tracking-wide">
                            Member of {profile.shortName} for {gymTenure(memberStats.joined_at)}
                          </p>
                        )}
                      </div>
                    )}
                    {!memberStats && <div className="mb-3" />}

                    {/* Stats tiles */}
                    <StatsTilesGrid
                      memberStats={memberStats}
                      gymRankings={gymRankings}
                      variant="dark"
                      className="w-full mb-3"
                    />

                    {/* Last class */}
                    {memberStats?.last_class_name && (
                      <p className="text-white/30 text-[11px] mb-3 text-center">
                        Last class: <span className="text-white/50">{memberStats.last_class_name}</span>
                        {" · "}{new Date(memberStats.last_class_date!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    )}
                  </>
                )}

                {profileTab === "badges" && (
                  <KioskBadgePanel badges={badges} tracked={trackedBadges} loading={badgesLoading} />
                )}

                {/* Pinned footer: whichever tab is open, checking in stays one tap
                    away and above the fold. */}
                <div className="flex-shrink-0 w-full pt-3">
                  <button
                    onClick={handleProfileContinue}
                    disabled={busy}
                    className="w-full h-12 md:h-14 rounded-2xl bg-yellow text-black font-bold text-base md:text-lg tracking-wide transition-all active:scale-95 disabled:opacity-30"
                  >
                    Check In
                  </button>
                  <button onClick={reset} className="mt-2 w-full text-white/30 hover:text-white/60 text-sm transition-colors">
                    Not me
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CLASS — push/pull: fixed header + scrollable list + fixed buttons */}
          {step === "class" && selected && (() => {
            const classItems = classes.map(c => {
              const classKey = c.id != null ? String(c.id) : c.name;
              return { ...c, classKey, alreadyDone: todayCheckedIn.includes(classKey) };
            });
            const available = classItems.filter(c => !c.alreadyDone);
            const allDone = classes.length > 0 && available.length === 0;
            const pickedKey = pickedClass
              ? (pickedClass.id != null ? String(pickedClass.id) : pickedClass.name)
              : null;

            return (
              <div className="flex-1 flex flex-col overflow-hidden px-4 md:px-8 pt-4 pb-4">
                <div className="flex flex-col flex-1 min-h-0 w-full max-w-sm mx-auto">

                  {/* Fixed header — avatar, greeting, prompt */}
                  <div className="flex-shrink-0 flex flex-col items-center pb-3">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/10 flex items-center justify-center font-display text-lg md:text-xl text-white mb-1.5">
                      {initials(selected)}
                    </div>
                    <h1 className="text-lg md:text-xl font-display text-white">Hi, {selected.first_name}!</h1>
                    <p className="text-white/40 text-xs md:text-sm mt-0.5">
                      {allDone ? "You\u2019re all done for today!" : "Which class are you checking into?"}
                    </p>
                  </div>

                  {/* Scrollable class list — fills all available space.
                      Fade is done with overlay divs (not mask-image) so touch
                      scroll works correctly on iOS/WebKit. The scroll
                      container carries `py-8` so the first and last items
                      sit past the fade zones at rest — they're never clipped
                      until the user actually scrolls them under the mask. */}
                  <div className="relative flex-1 min-h-0">
                    {/* Top fade overlay */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-8 z-10 bg-gradient-to-b from-black to-transparent" />
                    {/* Bottom fade overlay */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 z-10 bg-gradient-to-t from-black to-transparent" />
                    {/* Actual scroll container — absolute fill so it owns the full touch surface */}
                    <div ref={classListRef} className="absolute inset-0 overflow-y-auto scrollbar-hide py-8">
                    {classes.length === 0 ? (
                      <p className="text-white/30 text-sm text-center py-4">No classes scheduled today.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {classItems.map((c, i) => {
                          const isSelected = c.classKey === pickedKey;
                          return (
                            <button
                              data-class-item
                              key={c.classKey}
                              // Staggered entrance: 40ms between items, capped
                              // at ~10 items of stagger so a long list doesn't
                              // leave the last card hanging in animation limbo.
                              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                              onClick={() => { if (!c.alreadyDone) { setPickedClass(isSelected ? null : c); setRestrictionWarning(null); } }}
                              disabled={c.alreadyDone}
                              className={`animate-kiosk-list-in w-full rounded-2xl px-5 py-4 transition-all border ${
                                c.alreadyDone
                                  ? "bg-success/[0.06] border-success/20 cursor-default"
                                  : isSelected
                                    ? "bg-yellow/20 border-yellow"
                                    : "bg-white/5 border-white/10 hover:bg-white/10"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`font-semibold ${c.alreadyDone ? "text-white/30" : isSelected ? "text-yellow" : "text-white"}`}>
                                  {c.name}
                                </span>
                                <span className={`font-mono text-sm ${c.alreadyDone ? "text-white/20" : isSelected ? "text-yellow/60" : "text-white/40"}`}>
                                  {formatTime(c.start_time)}
                                </span>
                              </div>
                              {c.alreadyDone && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-success">
                                    <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <span className="text-success/70 text-xs font-medium">Checked in</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Fixed footer — action buttons always visible */}
                  <div className="flex-shrink-0 pt-3">
                    {allDone ? (
                      <button
                        onClick={reset}
                        className="w-full h-12 md:h-14 rounded-2xl bg-white/10 text-white/60 font-bold text-base md:text-lg tracking-wide transition-all active:scale-95"
                      >
                        Done
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleCheckIn}
                          disabled={!pickedClass || busy}
                          className="w-full h-12 md:h-14 rounded-2xl bg-yellow text-black font-bold text-base md:text-lg tracking-wide transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {busy ? "Checking in…" : "Check In"}
                        </button>
                        <button onClick={reset} className="mt-2 w-full py-1.5 text-center text-white/30 hover:text-white/60 text-sm transition-colors">
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Restriction warning — fixed overlay */}
                {restrictionWarning && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
                    <div className="bg-near-black rounded-2xl p-6 max-w-sm w-full border border-yellow/30 text-center">
                      <div className="w-12 h-12 rounded-full bg-yellow/20 flex items-center justify-center mx-auto mb-4">
                        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-yellow">
                          <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <h3 className="text-yellow font-display text-xl mb-2">Heads up!</h3>
                      <p className="text-white/50 text-sm mb-4">This class has restrictions:</p>
                      <p className="text-white font-semibold text-lg mb-6">{restrictionWarning}</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => { setRestrictionWarning(null); setPickedClass(null); }}
                          className="flex-1 h-12 rounded-xl bg-white/10 text-white/60 font-semibold text-sm transition-all active:scale-95"
                        >
                          Go Back
                        </button>
                        <button
                          onClick={handleCheckIn}
                          className="flex-1 h-12 rounded-xl bg-yellow text-black font-semibold text-sm transition-all active:scale-95"
                        >
                          Check In Anyway
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* SUCCESS — centered */}
          {step === "success" && selected && pickedClass && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full bg-yellow/20 flex items-center justify-center mb-6">
                  <svg viewBox="0 0 40 40" fill="none" className="w-12 h-12 text-yellow">
                    <path d="M8 20l9 9 15-15" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h1 className="font-display text-4xl text-white mb-2">You&apos;re in!</h1>
                <p className="text-yellow text-lg font-semibold">{selected.first_name} {selected.last_name}</p>
                <p className="text-white/40 mt-1">{pickedClass.name}</p>

                {/* Badges just unlocked. This is the payoff moment — the member is
                    standing right here — so it goes on the success screen rather
                    than waiting for them to open the portal later. */}
                {awardedBadges.length > 0 && (
                  <div className="mt-7 w-full max-w-md">
                    <p className="text-xs uppercase tracking-widest text-white/40 mb-3">
                      {awardedBadges.length === 1 ? "New badge unlocked" : `${awardedBadges.length} new badges unlocked`}
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {awardedBadges.map((b) => {
                        // TIER_STYLES is still read here for the tier NAME's colour;
                        // the medal resolves its own.
                        const tier = TIER_STYLES[b.badge_tier];
                        return (
                          <div
                            key={b.badge_slug}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.06] border border-white/10"
                          >
                            <BadgeMedal
                              icon={b.badge_icon}
                              tier={b.badge_tier}
                              earned
                              size="sm"
                              surface="dark"
                            />
                            <span className="text-left min-w-0">
                              <span className="block font-display text-lg text-white leading-tight">
                                {b.badge_name}
                              </span>
                              <span className="block text-xs uppercase tracking-wide" style={{ color: tier.fg }}>
                                {tier.label}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-white/20 text-sm mt-8">
                  {/* Fallback must match the delay the effect actually picked, or
                      the first frame reads "5s" and then jumps up to 9. */}
                  Resetting in {resetCountdown ?? Math.ceil(
                    (awardedBadges.length > 0 ? RESET_DELAY_BADGE_MS : RESET_DELAY_SUCCESS_MS) / 1000
                  )}s…
                </p>
                <button onClick={reset} className="mt-4 text-white/40 hover:text-white/70 text-sm transition-colors">
                  Check in another member
                </button>
                {lastCheckInId != null && (
                  <button
                    onClick={handleUndo}
                    disabled={undoing}
                    className="mt-2 text-white/30 hover:text-danger text-xs underline underline-offset-4 transition-colors disabled:opacity-40"
                  >
                    {undoing ? "Undoing\u2026" : "Oops, undo this check-in"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* UNDONE — centered */}
          {step === "undone" && selected && pickedClass && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-6">
                  <svg viewBox="0 0 40 40" fill="none" className="w-12 h-12 text-white/60">
                    <path d="M14 20h16M14 14l-6 6 6 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h1 className="font-display text-3xl text-white mb-2">Removed</h1>
                <p className="text-white/60 mt-1">{pickedClass.name} check-in undone.</p>
                <p className="text-white/20 text-xs mt-8">
                  Resetting in {resetCountdown ?? Math.ceil(RESET_DELAY_UNDONE_MS / 1000)}s&hellip;
                </p>
              </div>
            </div>
          )}

          {/* ERROR — centered */}
          {step === "error" && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-danger/20 flex items-center justify-center mb-6">
                  <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10 text-danger">
                    <path d="M12 12l16 16M28 12L12 28" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <h1 className="font-display text-3xl text-white mb-2">Hmm…</h1>
                <p className="text-danger mb-8">{msg}</p>
                <button onClick={reset} className="px-8 py-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors">
                  Try again
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
