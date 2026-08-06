/**
 * Top-level error boundary for the App Router. Catches any uncaught
 * exception in a Server Component / Server Action and renders a
 * friendly fallback UI instead of the raw stack trace.
 *
 * Three responsibilities:
 *   1. Tell the user something went wrong, not how.
 *   2. Fire a client-side log.error — CloudWatch RUM auto-captures it
 *      too (uncaught client-side), but logging explicitly gives us
 *      the `digest` ID Next generates so we can correlate server +
 *      client views of the same failure.
 *   3. Offer a retry button — Next's `reset()` re-renders this segment
 *      with a fresh render pass, which fixes most transient issues
 *      (a flaky DB read, a race on a cached value).
 */

"use client";

import { useEffect } from "react";

export default function GlobalSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Don't use our structured logger here — we're in a client boundary
    // and `log.ts` expects server-side ALS. CloudWatch RUM already
    // captures the exception; a plain console.error surfaces it in dev.
    // eslint-disable-next-line no-console
    console.error("[app error boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="font-mono text-xs uppercase tracking-wider text-muted/70 mb-2">
          error
        </div>
        <h1 className="font-display text-3xl text-ink mb-3">
          Something went wrong.
        </h1>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          We&apos;ve been notified and are looking into it. You can try
          again; if the problem persists, please contact support and
          mention error ID{" "}
          {error.digest ? (
            <code className="font-mono text-xs bg-paper px-1.5 py-0.5 rounded border border-line">
              {error.digest}
            </code>
          ) : (
            "(none)"
          )}
          .
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-black text-white text-sm font-semibold hover:bg-near-black transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
