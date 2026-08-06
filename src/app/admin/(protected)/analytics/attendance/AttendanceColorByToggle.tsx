"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Small pill toggle that lives on the StackedClassBar card's header.
 * Writes the choice to the URL (`?colorBy=weekday|modality`) so state
 * is sharable + back-button-friendly.
 *
 * We deliberately keep this wired to the URL instead of React state so
 * the server-rendered `StackedClassBar` gets the right color mode on
 * the initial paint — no flash from default → user-chosen.
 */
type Mode = "weekday" | "modality";

const OPTIONS: { value: Mode; label: string }[] = [
  { value: "weekday", label: "Weekday" },
  { value: "modality", label: "Modality" },
];

export default function AttendanceColorByToggle({ current }: { current: Mode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function set(mode: Mode) {
    if (mode === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (mode === "weekday") {
      // Default — keep the URL clean.
      params.delete("colorBy");
    } else {
      params.set("colorBy", mode);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Bar color mode"
      className="inline-flex items-center rounded-full border border-line bg-white overflow-hidden text-[11px]"
    >
      {OPTIONS.map(opt => {
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={isPending}
            onClick={() => set(opt.value)}
            className={`px-2.5 py-1 font-medium transition-colors whitespace-nowrap ${
              active ? "bg-black text-white" : "text-muted hover:text-ink hover:bg-paper"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
