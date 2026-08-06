"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { PeriodLabel } from "@/lib/analytics/types";
import type { AudienceKind } from "@/lib/supabase/types";

/**
 * When PeriodBar fires a navigation, mirror `isPending` onto a
 * `document.body` data attribute so sibling content (charts, tables)
 * below the bar can dim itself via CSS. `globals.css` wires
 * `body[data-analytics-loading] main` → `opacity:0.55 pointer-events:none
 * blur`. Kept in this one place so we don't have to thread a context /
 * pass props across every async RSC boundary on the page.
 */
function useBodyLoadingFlag(isPending: boolean): void {
  useEffect(() => {
    if (!isPending) return;
    document.body.setAttribute("data-analytics-loading", "true");
    return () => document.body.removeAttribute("data-analytics-loading");
  }, [isPending]);
}

const OPTIONS: { label: string; short: string; value: PeriodLabel }[] = [
  { label: "Week",       short: "Week", value: "week" },
  { label: "Month",      short: "Month", value: "month" },
  { label: "Quarter",    short: "Qtr",   value: "quarter" },
  { label: "Year",       short: "Year",  value: "year" },          // YTD
  { label: "6 months",   short: "6mo",   value: "last_6_months" },
  { label: "12 months",  short: "12mo",  value: "last_12_months" },
];

/**
 * Minimal shape of a dimension option for the secondary filter row.
 * Server pages pre-load `listModalities()` / `listLevels()` / `listAudiences()`
 * and pass arrays of these into PeriodBar. We deliberately don't import
 * the richer `ClassModality` / `ClassAudience` interfaces — the bar only
 * needs these three fields and the narrower type keeps the prop surface
 * tight.
 */
export interface FilterOption {
  slug: string;
  name: string;
}
/** Audience variant also carries `kind` so we can group within the popover. */
export interface AudienceFilterOption extends FilterOption {
  kind: AudienceKind;
}

/**
 * Dimension filters rendered on the secondary (wrapped) row. Pages that
 * don't care about filtering (Overview / Members / Instructors) simply
 * omit `filters` and the row doesn't render.
 *
 * `modality` + `audience` are multi-select. `level` is single-select
 * per LLD §3.4. Everything is URL-param driven — no local state beyond
 * which popover is open.
 */
export interface FilterConfig {
  modalities: FilterOption[];
  levels: FilterOption[];
  audiences: AudienceFilterOption[];
}

interface Props {
  current: PeriodLabel;
  /** Human-readable current range, e.g. "Apr 14 – Apr 20, 2026". */
  rangeLabel: string;
  generatedAt?: string;
  /** Right-aligned action slot (CSV export, etc.). */
  action?: React.ReactNode;
  /** Optional dimension-filter configuration. When provided, a second
   *  wrap-row renders under the period chips with three popover chips. */
  filters?: FilterConfig;
}

/**
 * Sticky top bar for every analytics page. Writes the chosen period to
 * URL query params (`?period=month`) so the URL is sharable and survives
 * refresh. Server Components on this route tree read the same param.
 *
 * When `filters` is passed, a secondary wrap-row renders under the
 * period chips with three popover chips (Modality / Level / Audience).
 * Each popover updates `?modality=gi,no-gi&level=advanced&audience=women-only`
 * via `router.replace()` so back/forward navigation stays useful.
 */
export default function PeriodBar({ current, rangeLabel, generatedAt, action, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  useBodyLoadingFlag(isPending);

  function setPeriod(value: PeriodLabel) {
    if (value === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "week") {
      params.delete("period");
    } else {
      params.set("period", value);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    });
  }

  // Current filter values parsed directly from the URL — no separate
  // local state so back/forward navigation always restores correctly.
  const selectedModalities = parseCsvParam(searchParams.get("modality"));
  const selectedLevel = searchParams.get("level");
  const selectedAudiences = parseCsvParam(searchParams.get("audience"));

  function setFilter(key: "modality" | "level" | "audience", values: string[] | string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (Array.isArray(values)) {
      if (values.length === 0) params.delete(key);
      else params.set(key, values.join(","));
    } else {
      if (values === null || values === "") params.delete(key);
      else params.set(key, values);
    }
    const qs = params.toString();
    // `replace` rather than `push` — the filter row toggles fire
    // fast-and-often, and nobody wants ten back-button presses to
    // un-filter a chart.
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <div className="sticky top-0 z-20 bg-off-white/90 backdrop-blur border-b border-line">
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 lg:px-8 py-3">
        {/* Period buttons — wraps to a second line on narrow viewports
            so all 6 options stay tap-sized. Compact labels (Qtr, 6mo,
            12mo) kick in below `sm` to keep the row tidy. */}
        <div
          role="radiogroup"
          aria-label="Analytics period"
          className="inline-flex flex-wrap items-center rounded-md border border-line bg-white overflow-hidden"
        >
          {OPTIONS.map(opt => {
            const active = current === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPeriod(opt.value)}
                disabled={isPending}
                className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-black text-white"
                    : "text-muted hover:text-ink hover:bg-paper"
                }`}
                title={opt.label}
              >
                <span className="hidden sm:inline">{opt.label}</span>
                <span className="sm:hidden">{opt.short}</span>
              </button>
            );
          })}
        </div>

        {/* Range label */}
        <div className="text-xs text-muted tabular-nums">
          <span className="font-mono uppercase tracking-wider mr-1.5 text-[10px]">Range</span>
          {rangeLabel}
        </div>

        {/* Freshness stamp — collapses to a spinner while a navigation
            is in flight so the user knows work is happening even when the
            fetch is quick. */}
        {generatedAt ? (
          <div className="text-[10px] text-muted/70 font-mono ml-auto flex items-center gap-1.5">
            {isPending ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block w-3 h-3 border-[1.5px] border-ink/40 border-t-ink rounded-full animate-spin"
                />
                <span>Updating…</span>
              </>
            ) : (
              <span>
                Updated {new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        ) : null}

        {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
      </div>

      {/* ── Secondary row: dimension filters (WS5) ─────────────────────── */}
      {filters ? (
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 lg:px-8 pb-2">
          <span className="font-mono uppercase tracking-wider text-[10px] text-muted mr-0.5">
            Filter
          </span>

          <MultiSelectChip
            label="Modality"
            allLabel="All modalities"
            options={filters.modalities}
            selected={selectedModalities}
            disabled={isPending}
            onChange={slugs => setFilter("modality", slugs)}
          />

          <SingleSelectChip
            label="Level"
            allLabel="All levels"
            options={filters.levels}
            selected={selectedLevel}
            disabled={isPending}
            onChange={slug => setFilter("level", slug)}
          />

          <AudienceChip
            label="Audience"
            allLabel="All audiences"
            options={filters.audiences}
            selected={selectedAudiences}
            disabled={isPending}
            onChange={slugs => setFilter("audience", slugs)}
          />

          {(selectedModalities.length > 0 ||
            selectedLevel ||
            selectedAudiences.length > 0) ? (
            <button
              type="button"
              className="text-[11px] text-muted underline hover:text-ink px-1"
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("modality");
                params.delete("level");
                params.delete("audience");
                const qs = params.toString();
                startTransition(() => {
                  router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
                });
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Filter chip primitives ────────────────────────────────────────────────

function parseCsvParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Chip-triggered popover. The popover is rendered in-flow below the chip
 * — the sticky parent container's `overflow` is visible so a floating
 * absolute layer sits cleanly on top of the page content. Outside-click
 * + Escape close the popover.
 */
function PopoverChip({
  label,
  summary,
  active,
  disabled,
  children,
}: {
  label: string;
  summary: string;
  active: boolean;
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
          active
            ? "bg-black text-white border-black"
            : "bg-white text-ink border-line hover:bg-paper"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="font-medium">{label}:</span>
        <span className="truncate max-w-[12rem]">{summary}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M1 2l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute z-30 mt-1 min-w-[12rem] max-w-[16rem] bg-white border border-line rounded-md shadow-lg p-2 max-h-80 overflow-auto"
          role="menu"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function MultiSelectChip({
  label,
  allLabel,
  options,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: FilterOption[];
  selected: string[];
  disabled?: boolean;
  onChange: (slugs: string[]) => void;
}) {
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find(o => o.slug === selected[0])?.name ?? selected[0]
        : `${selected.length} selected`;
  const active = selected.length > 0;

  return (
    <PopoverChip label={label} summary={summary} active={active} disabled={disabled}>
      {() => (
        <div className="flex flex-col gap-0.5">
          {options.length === 0 ? (
            <div className="text-xs text-muted px-2 py-1">No options.</div>
          ) : (
            options.map(opt => {
              const on = selected.includes(opt.slug);
              return (
                <label
                  key={opt.slug}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-paper cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    className="rounded border-line"
                    checked={on}
                    onChange={() => {
                      const next = on
                        ? selected.filter(s => s !== opt.slug)
                        : [...selected, opt.slug];
                      onChange(next);
                    }}
                  />
                  <span className="text-ink">{opt.name}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </PopoverChip>
  );
}

function SingleSelectChip({
  label,
  allLabel,
  options,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: FilterOption[];
  selected: string | null;
  disabled?: boolean;
  onChange: (slug: string | null) => void;
}) {
  const summary = selected
    ? options.find(o => o.slug === selected)?.name ?? selected
    : allLabel;
  const active = !!selected;

  return (
    <PopoverChip label={label} summary={summary} active={active} disabled={disabled}>
      {close => (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            className={`flex items-center gap-2 px-2 py-1 rounded text-xs text-left hover:bg-paper ${
              selected === null ? "bg-paper font-medium" : ""
            }`}
            onClick={() => {
              onChange(null);
              close();
            }}
          >
            {allLabel}
          </button>
          {options.map(opt => (
            <button
              key={opt.slug}
              type="button"
              className={`flex items-center gap-2 px-2 py-1 rounded text-xs text-left hover:bg-paper ${
                selected === opt.slug ? "bg-paper font-medium" : ""
              }`}
              onClick={() => {
                onChange(opt.slug);
                close();
              }}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </PopoverChip>
  );
}

/**
 * Audience multi-select — same shape as MultiSelectChip but the list is
 * grouped by `kind` (Age / Gender / Rank / Access) so the owner can
 * scan the matrix faster.
 */
function AudienceChip({
  label,
  allLabel,
  options,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: AudienceFilterOption[];
  selected: string[];
  disabled?: boolean;
  onChange: (slugs: string[]) => void;
}) {
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find(o => o.slug === selected[0])?.name ?? selected[0]
        : `${selected.length} selected`;
  const active = selected.length > 0;

  // Group by kind. Stable ordering: Age → Gender → Rank → Access.
  const allGroups: { kind: AudienceKind; title: string; items: AudienceFilterOption[] }[] = [
    { kind: "age",    title: "Age",    items: options.filter(o => o.kind === "age") },
    { kind: "gender", title: "Gender", items: options.filter(o => o.kind === "gender") },
    { kind: "rank",   title: "Rank",   items: options.filter(o => o.kind === "rank") },
    { kind: "access", title: "Access", items: options.filter(o => o.kind === "access") },
  ];
  const groups = allGroups.filter(g => g.items.length > 0);

  return (
    <PopoverChip label={label} summary={summary} active={active} disabled={disabled}>
      {() => (
        <div className="flex flex-col gap-2">
          {groups.length === 0 ? (
            <div className="text-xs text-muted px-2 py-1">No options.</div>
          ) : (
            groups.map(g => (
              <div key={g.kind} className="flex flex-col gap-0.5">
                <div className="font-mono uppercase tracking-wider text-[10px] text-muted px-2 pt-1">
                  {g.title}
                </div>
                {g.items.map(opt => {
                  const on = selected.includes(opt.slug);
                  return (
                    <label
                      key={opt.slug}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-paper cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-line"
                        checked={on}
                        onChange={() => {
                          const next = on
                            ? selected.filter(s => s !== opt.slug)
                            : [...selected, opt.slug];
                          onChange(next);
                        }}
                      />
                      <span className="text-ink">{opt.name}</span>
                    </label>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </PopoverChip>
  );
}
