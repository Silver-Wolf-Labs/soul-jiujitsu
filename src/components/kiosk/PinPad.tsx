"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Spinner from "@/components/ui/Spinner";

// 3x3 + "0" flanked by an empty spacer and backspace. The empty slot renders
// as a disabled button so the grid stays perfectly square.
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

interface Props {
  /** Current typed digits (parent owns the state so the pad stays controlled). */
  code: string;
  /** Fired for every tap: digits "0"-"9" or the backspace glyph "⌫". */
  onDigit: (digit: string) => void;
  /** Number of slots rendered in the display. Default 4. */
  length?: number;
  /** When true, shows spinner + disables the numpad. */
  busy?: boolean;
  /** Error string shown in the status row (only when !busy). */
  error?: string;
  /**
   * Custom content for the reserved-height status row (replaces the default
   * busy/error slot). Useful for countdowns or help text.
   */
  statusSlot?: ReactNode;
  /** Optional node above the PIN display — title, logo, etc. */
  header?: ReactNode;
  /** Optional node below the numpad — hint text, links, etc. */
  footer?: ReactNode;
  /** Mask typed digits after maskDelayMs. Only the newest typed digit briefly reveals. */
  privacyMask?: boolean;
  maskDelayMs?: number;
  maskGlyph?: string;
  className?: string;
}

/**
 * Reusable kiosk PIN pad — used by `/kiosk` (unlock) and `/kiosk/checkin`
 * (member lookup).
 *
 * Visual: large typographic digit over an underline bar, centered 3x3 numpad
 * with ⌫, and a reserved-height status row (so swapping between spinner and
 * error never nudges the tap targets under a finger already in motion).
 *
 * Privacy mask pattern (iOS/banking): the newest typed digit is visible for
 * `maskDelayMs`, then swaps to `maskGlyph`. Earlier digits stay masked — no
 * mass re-reveal on each keypress.
 */
export default function PinPad({
  code,
  onDigit,
  length = 4,
  busy = false,
  error,
  statusSlot,
  header,
  footer,
  privacyMask = false,
  maskDelayMs = 500,
  maskGlyph = "●",
  className = "",
}: Props) {
  // Index of the currently-revealed digit; -1 means all digits are masked.
  const [revealIdx, setRevealIdx] = useState(-1);
  const prevLenRef = useRef(code.length);

  useEffect(() => {
    const prev = prevLenRef.current;
    prevLenRef.current = code.length;

    if (!privacyMask) {
      setRevealIdx(-1);
      return;
    }
    if (code.length > prev) {
      // New digit added — reveal it briefly, then re-mask.
      setRevealIdx(code.length - 1);
      const id = setTimeout(() => setRevealIdx(-1), maskDelayMs);
      return () => clearTimeout(id);
    }
    // Backspace / reset — nothing to reveal.
    setRevealIdx(-1);
  }, [code.length, privacyMask, maskDelayMs]);

  function slotChar(i: number): string {
    if (i >= code.length) return "\u00A0"; // nbsp reserves height in empty slots
    if (!privacyMask || i === revealIdx) return code[i];
    return maskGlyph;
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {header}

      {/* PIN display — big digit over underline bar. */}
      <div className="flex gap-5 mb-6">
        {Array.from({ length }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <span className="font-display text-4xl text-white w-10 h-10 text-center leading-10">
              {slotChar(i)}
            </span>
            <div
              className={`h-0.5 w-10 rounded-full transition-colors ${
                code.length > i ? "bg-yellow" : "bg-white/15"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Reserved-height status row — spinner / error / custom, never shifts the numpad. */}
      <div className="mb-4 h-5 flex items-center justify-center">
        {statusSlot !== undefined ? (
          statusSlot
        ) : busy ? (
          <Spinner size="sm" delay={false} className="text-white/40" />
        ) : (
          <div
            className={`text-danger text-sm text-center transition-opacity ${
              error ? "opacity-100" : "opacity-0"
            }`}
            aria-live="polite"
          >
            {error || "\u00A0"}
          </div>
        )}
      </div>

      {/* Numpad. */}
      <div
        className={`grid grid-cols-3 gap-3 w-full transition-opacity ${
          busy ? "opacity-40 pointer-events-none" : ""
        }`}
      >
        {DIGITS.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => d && onDigit(d)}
            disabled={!d || busy}
            className={`h-[4.5rem] md:h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-95 ${
              d === ""
                ? "bg-transparent cursor-default"
                : d === "⌫"
                ? "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
                : "bg-white/10 text-white hover:bg-white/20 active:bg-white/30"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {footer}
    </div>
  );
}
