/**
 * Root-level error boundary — catches failures in the root layout
 * itself (before `error.tsx` mounts). Must render its own `<html>`
 * and `<body>` because the layout failed before providing them.
 *
 * Kept intentionally minimal: no styling imports, no shared components,
 * just a stripped-down HTML page. If THIS fails, there's nothing else
 * we can do.
 */

"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[root error boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "48px 24px",
          textAlign: "center",
          color: "#1a1a1a",
          background: "#fafaf9",
          minHeight: "100vh",
          margin: 0,
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong.</h1>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
          Please try again. If the problem persists, contact support.
          {error.digest ? ` (Error: ${error.digest})` : ""}
        </p>
        <button
          onClick={reset}
          style={{
            padding: "10px 20px",
            background: "#000",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
