"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SignatureCanvas, SignatureCanvasHandle } from "./SignatureCanvas";

interface Props {
  onConfirm: (dataUrl: string) => void;
  onClose: () => void;
}

// Narrow cast for screen.orientation — TypeScript's DOM lib doesn't type
// .lock/.unlock on ScreenOrientation everywhere, but they're well-defined
// in the WHATWG Screen Orientation spec and implemented by Chromium browsers.
type OrientationLockType =
  | "any"
  | "natural"
  | "landscape"
  | "portrait"
  | "portrait-primary"
  | "portrait-secondary"
  | "landscape-primary"
  | "landscape-secondary";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
  unlock?: () => void;
};

/**
 * Full-viewport signature pad modal.
 *
 * Rendered in a portal so it escapes any overflow/stacking context. Works in
 * both portrait and landscape — the canvas is CSS-scaled to fill the
 * available space and coordinates are always computed from
 * getBoundingClientRect() so rotation is handled automatically.
 *
 * Mobile niceties:
 *  - On open we request the browser's true fullscreen API (hides URL bar on
 *    Android Chrome) and attempt to lock orientation to landscape via
 *    `screen.orientation.lock('landscape')`. Both calls are best-effort and
 *    gracefully no-op on browsers that don't support them (notably iOS
 *    Safari, which silently rejects the orientation lock).
 *  - When the user is on a touch device and still in portrait after the
 *    lock attempt, we show a "Rotate your device to landscape" hint so
 *    iOS users know to turn the phone.
 *  - On close we release the lock and exit fullscreen to leave the rest of
 *    the app in a clean orientation state.
 */
export function SignaturePadModal({ onConfirm, onClose }: Props) {
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  // Portal requires document to be available (client only)
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    setIsTouch(
      window.matchMedia("(hover: none) and (pointer: coarse)").matches,
    );
    const mq = window.matchMedia("(orientation: portrait)");
    setIsPortrait(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mq.addEventListener?.("change", listener);
    return () => mq.removeEventListener?.("change", listener);
  }, []);

  // Try fullscreen + orientation lock after mount. Both are best-effort —
  // any failure is swallowed because the fallback (CSS fixed-inset overlay)
  // already gives a passable experience on unsupported browsers.
  useEffect(() => {
    if (!mounted) return;
    const el = rootRef.current;
    if (!el) return;

    const tryFullscreen = async () => {
      try {
        if (document.fullscreenElement == null) {
          await el.requestFullscreen?.();
        }
      } catch {
        /* Safari desktop / iOS PWA / denied — fall back to CSS overlay. */
      }
      try {
        const orientation =
          typeof screen !== "undefined"
            ? (screen.orientation as LockableOrientation | undefined)
            : undefined;
        await orientation?.lock?.("landscape");
      } catch {
        /* iOS Safari rejects — hint text covers this case. */
      }
    };
    tryFullscreen();

    return () => {
      try {
        const orientation =
          typeof screen !== "undefined"
            ? (screen.orientation as LockableOrientation | undefined)
            : undefined;
        orientation?.unlock?.();
      } catch {
        /* no-op */
      }
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {
          /* no-op */
        });
      }
    };
  }, [mounted]);

  const handleConfirm = () => {
    if (canvasRef.current?.isEmpty()) return;
    onConfirm(canvasRef.current!.toDataURL());
  };

  const handleClear = () => {
    canvasRef.current?.clear();
    setIsEmpty(true);
  };

  if (!mounted) return null;

  const modal = (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="Signature pad"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line flex-shrink-0">
        <div>
          <p className="font-semibold text-black text-sm">Draw your signature</p>
          <p className="text-xs text-muted mt-0.5">Use your finger or mouse to sign below</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-off-white transition-colors text-ink"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Portrait-on-touch hint — shown when orientation lock was rejected
          (notably iOS Safari). Purely informational; the pad still works. */}
      {isTouch && isPortrait && (
        <div className="px-4 py-2 bg-off-white border-b border-line flex items-center gap-2 text-xs text-ink flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M4 2h6a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"
              stroke="currentColor" strokeWidth="1.2"
            />
            <path d="M7 10.5v0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Rotate your device to landscape for a bigger signing area.
        </div>
      )}

      {/* Canvas area — fills remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
        <div className="w-full max-w-2xl flex flex-col gap-2">
          {/* Canvas with border, scales to container width */}
          <div className="relative border-2 border-line rounded-lg overflow-hidden bg-white shadow-sm">
            <SignatureCanvas
              ref={canvasRef}
              className="w-full h-auto block"
              onChange={setIsEmpty}
            />
            {/* Baseline guide */}
            <div
              className="absolute bottom-8 left-4 right-4 border-b border-dashed border-line pointer-events-none"
              aria-hidden
            />
            {/* Placeholder text when empty */}
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                <p className="text-line text-sm font-medium tracking-wide">Sign here</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted text-center">
            Draw your full signature above
          </p>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-line flex-shrink-0 gap-3">
        <button
          onClick={handleClear}
          className="px-4 py-2 text-sm text-ink border border-line rounded hover:bg-off-white transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleConfirm}
          disabled={isEmpty}
          className="flex-1 max-w-xs px-4 py-2 text-sm font-semibold bg-black text-white rounded hover:bg-near-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          OK &middot; Use this signature
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
