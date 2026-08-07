/**
 * Shared loading spinner — consistent across the entire app.
 *
 * Sizes:
 *   sm  — 16px, for inline use inside buttons
 *   md  — 24px, default, for card/section loading
 *   lg  — 32px, for full-page loading states
 *
 * The `delay` prop (default true for md/lg) fades the spinner in after
 * 400ms so fast navigations don't flash.
 */

const SIZE_MAP = {
  sm: { px: 16, stroke: 2.5 },
  md: { px: 24, stroke: 2.5 },
  lg: { px: 32, stroke: 2 },
} as const;

interface Props {
  size?: "sm" | "md" | "lg";
  label?: string;
  /** When true, spinner fades in after 400ms to avoid flash. Defaults to true for md/lg. */
  delay?: boolean;
  className?: string;
}

export default function Spinner({ size = "md", label, delay, className = "" }: Props) {
  const { px, stroke } = SIZE_MAP[size];
  const shouldDelay = delay ?? size !== "sm";

  return (
    <span
      className={`inline-flex items-center gap-2 ${shouldDelay ? "animate-admin-loading-in" : ""} ${className}`}
      role="status"
    >
      <svg
        className="animate-spin"
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={stroke}
          className="opacity-15"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <span className="text-xs font-mono tracking-widest uppercase opacity-50">
          {label}
        </span>
      )}
      <span className="sr-only">{label ?? "Loading"}</span>
    </span>
  );
}

/**
 * Centered full-area spinner — drop into any container to fill it.
 * Good for page-level loading states and admin data tables.
 */
export function SpinnerPage({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center gap-3 text-black dark:text-ink">
        <Spinner size="lg" delay label={label ?? "Loading"} />
      </div>
    </div>
  );
}

/**
 * Inline spinner for buttons — pass as children when loading.
 * Usage: {loading ? <SpinnerButton label="Saving" /> : "Save"}
 */
export function SpinnerButton({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Spinner size="sm" delay={false} />
      {label && <span>{label}</span>}
    </span>
  );
}
