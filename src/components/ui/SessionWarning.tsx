"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Config ───────────────────────────────────────────────────────────────────

const WARNING_WINDOW = 30_000; // show modal 30s before expiry
const TICK_INTERVAL = 1_000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  /** Idle timeout in ms. Omit to disable idle tracking. */
  idleMs?: number;
  /** Absolute timestamp (Date.now()-based) of hard session expiry. */
  hardExpiresAt?: number;
  /** Where to redirect when session expires. */
  redirectPath: string;
  /** Called when user clicks "Stay Logged In". Should refresh the server session.
   *  If omitted for a given trigger (e.g. hard expiry), the extend button is hidden. */
  onExtend?: () => Promise<void>;
  /** Visual variant to match context. */
  variant?: "light" | "dark";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SessionWarning({
  idleMs,
  hardExpiresAt,
  redirectPath,
  onExtend,
  variant = "light",
}: Props) {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [canExtend, setCanExtend] = useState(false);
  const [extending, setExtending] = useState(false);
  const redirectedRef = useRef(false);

  // Track user activity
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, recordActivity, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, recordActivity);
      }
    };
  }, [recordActivity]);

  // Main tick: compute time remaining, show/hide modal, trigger redirect
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      // Compute remaining ms for each limit
      const idleRemaining = idleMs != null
        ? idleMs - (now - lastActivityRef.current)
        : Infinity;
      const hardRemaining = hardExpiresAt != null
        ? hardExpiresAt - now
        : Infinity;

      const msLeft = Math.min(idleRemaining, hardRemaining);
      const sLeft = Math.ceil(msLeft / 1000);

      if (msLeft <= 0 && !redirectedRef.current) {
        // Time's up — redirect
        redirectedRef.current = true;
        router.push(redirectPath);
        return;
      }

      if (msLeft <= WARNING_WINDOW && msLeft > 0) {
        // Idle-triggered warnings can be extended; hard-expiry ones cannot
        const isIdleTrigger = idleRemaining <= hardRemaining;
        setCanExtend(isIdleTrigger && onExtend != null);
        setSecondsLeft(sLeft);
      } else {
        setSecondsLeft(null);
      }
    }, TICK_INTERVAL);

    return () => clearInterval(interval);
  }, [idleMs, hardExpiresAt, redirectPath, onExtend, router]);

  async function handleExtend() {
    if (!onExtend) return;
    setExtending(true);
    try {
      await onExtend();
      lastActivityRef.current = Date.now();
      setSecondsLeft(null);
    } finally {
      setExtending(false);
    }
  }

  function handleLogout() {
    redirectedRef.current = true;
    router.push(redirectPath);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (secondsLeft == null) return null;

  const isDark = variant === "dark";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 animate-in fade-in duration-200">
      <div
        className={`w-full max-w-sm mx-4 rounded-2xl p-6 text-center shadow-2xl ${
          isDark
            ? "bg-near-black border border-white/10"
            : "bg-white border border-line"
        }`}
      >
        {/* Warning icon */}
        <div className={`mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center ${
          isDark ? "bg-yellow/15" : "bg-yellow/10"
        }`}>
          <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-yellow" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>

        {/* Heading */}
        <h2 className={`font-display text-2xl mb-1 ${isDark ? "text-white" : "text-black"}`}>
          Session Expiring
        </h2>
        <p className={`text-sm mb-5 ${isDark ? "text-white/40" : "text-muted"}`}>
          {canExtend
            ? "You\u2019ve been inactive for a while."
            : "Your session is about to end."}
        </p>

        {/* Countdown */}
        <div className={`font-display text-5xl tabular-nums mb-6 ${
          secondsLeft <= 10 ? "text-danger" : isDark ? "text-yellow" : "text-black"
        }`}>
          {secondsLeft}<span className={`text-lg ml-1 ${isDark ? "text-white/30" : "text-muted"}`}>s</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          {canExtend ? (
            <>
              <button
                onClick={handleExtend}
                disabled={extending}
                className={`w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-[0.98] disabled:opacity-50 ${
                  isDark
                    ? "bg-yellow text-black hover:bg-yellow/90"
                    : "bg-black text-white hover:bg-near-black"
                }`}
              >
                {extending ? "Extending\u2026" : "Stay Logged In"}
              </button>
              <button
                onClick={handleLogout}
                className={`w-full py-2.5 rounded-xl text-sm transition-colors ${
                  isDark
                    ? "text-white/30 hover:text-white/60"
                    : "text-muted hover:text-ink"
                }`}
              >
                Log Out
              </button>
            </>
          ) : (
            <button
              onClick={handleLogout}
              className={`w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-[0.98] ${
                isDark
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-black text-white hover:bg-near-black"
              }`}
            >
              Log In Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
