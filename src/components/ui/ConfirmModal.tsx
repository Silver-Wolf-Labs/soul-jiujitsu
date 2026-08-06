"use client";

import { useState } from "react";

interface Props {
  title: string;
  /** Body content. Pass a string or any React node (e.g. a `<p>` with
   *  inline `<strong>` highlights). */
  body: React.ReactNode;
  /** Label for the confirmation button (default "Confirm"). */
  confirmLabel?: string;
  /** Busy label shown while the action runs (default "Working…"). */
  confirmBusyLabel?: string;
  /** Visual tone for the confirm button. `danger` for destructive
   *  actions, `primary` (black) for everything else. Default: primary. */
  tone?: "primary" | "danger";
  /** Runs on confirm. If it returns a promise the button shows a busy
   *  state until it resolves. Thrown errors propagate so the parent can
   *  surface them — the modal itself doesn't render errors. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Lightweight yes/no confirmation dialog.
 *
 * Replaces `window.confirm()` for places where we want a styled modal
 * instead of the native browser alert — kiosk + mobile admin flows look
 * better, the wording is reusable, and the confirm button can show a
 * busy state while the underlying action runs.
 *
 * Intentionally stateless about what the action DOES — the parent owns
 * the handler, and thrown errors bubble up. Pair with an existing error
 * surface (banner, toast) when you need to show failures.
 */
export default function ConfirmModal({
  title,
  body,
  confirmLabel = "Confirm",
  confirmBusyLabel = "Working\u2026",
  tone = "primary",
  onConfirm,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  const confirmClasses =
    tone === "danger"
      ? "bg-danger text-white hover:bg-danger/90"
      : "bg-black text-white hover:bg-near-black";

  return (
    // Backdrop scrolls vertically so tall bodies (or short viewports like
    // landscape mobile) don't clip the dialog. `items-start` + top padding
    // puts the modal near the top of the screen with breathing room —
    // matches the BeltDetailsModal anchoring so the two look like the
    // same control surface.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-6 sm:py-12 overflow-y-auto"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 my-auto sm:my-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-lg font-display text-ink mb-2">{title}</h3>
        <div className="text-sm text-muted mb-5">{body}</div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 text-sm px-4 py-2 border border-line rounded hover:bg-off-white disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className={`flex-1 text-sm px-4 py-2 rounded disabled:opacity-60 transition-colors ${confirmClasses}`}
          >
            {busy ? confirmBusyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
