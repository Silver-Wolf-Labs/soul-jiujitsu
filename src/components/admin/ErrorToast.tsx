"use client";

import { X } from "lucide-react";

/**
 * Floating error toast — slides in from bottom-right, auto-dismisses via
 * useToast hook (the caller owns the timer). Pass `onDismiss` to wire up the
 * ✕ button.
 */
export default function ErrorToast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] animate-admin-page-in bg-danger-light border border-danger-border text-danger text-sm px-4 py-3 rounded-lg shadow-lg max-w-sm flex items-start gap-3">
      <span className="flex-1 leading-snug">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-danger/50 hover:text-danger shrink-0 -mr-1 -mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
