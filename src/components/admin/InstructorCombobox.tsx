"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Users, UserPlus } from "lucide-react";
import type { InstructorOption } from "@/lib/actions/instructors";

/**
 * Selected instructor — either resolved to an existing row (`instructor_id`
 * set) or a freshly-typed stub (`name` set, no id yet). The server-side
 * schedule action resolves stubs into real `instructors` rows on save, so
 * the component can stay stateless about persistence.
 */
export type SelectedInstructor = {
  instructor_id?: number | null;
  name: string;
};

interface Props {
  /** Primary first. */
  value: SelectedInstructor[];
  onChange: (next: SelectedInstructor[]) => void;
  /** Full instructor roster (admin UI filters to `active` in parent). */
  options: InstructorOption[];
  /** Hard cap on selections — 3 keeps chips readable at mobile widths. */
  max?: number;
  placeholder?: string;
  /** When true, the dropdown shows "Create 'X'" for unmatched input. */
  allowCreate?: boolean;
  /** Shows next to input. Set empty string to hide. */
  helperText?: string;
  /** Compact (single-row) look for narrow sidebars; defaults to spacious. */
  compact?: boolean;
  /** Surface a one-line warning when the admin chooses the inline-stub
   *  path rather than an existing instructor — attribution works but the
   *  warning teaches the "fully register for better analytics" habit. */
  showStubWarning?: boolean;
}

/**
 * Multi-select combobox for assigning instructors to a class.
 *
 * UX:
 *   - Chips show the currently-selected instructors. First chip = primary.
 *     Click × to remove. Backspace in empty input removes the last chip.
 *   - Type to filter the roster. ↑/↓ navigate, Enter commits.
 *   - Typing a name that doesn't match any option reveals a "Create 'X'"
 *     row at the bottom; pressing Enter on it (or clicking) adds a stub
 *     chip. The stub is resolved server-side at save time.
 *
 * Accessibility:
 *   - Root has role="combobox" aria-expanded/aria-controls.
 *   - Listbox uses role="listbox", options role="option" with aria-selected.
 *   - Live announcements via aria-live on the helper text when state changes.
 *
 * This component never hits the network — the parent owns the list of
 * `options` and the payload shape understood by the server action.
 */
export default function InstructorCombobox({
  value,
  onChange,
  options,
  max = 3,
  placeholder = "Search or add an instructor…",
  allowCreate = true,
  helperText,
  compact = false,
  showStubWarning = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputId = useMemo(() => `instructor-combobox-${Math.random().toString(36).slice(2, 9)}`, []);
  const listboxId = `${inputId}-listbox`;

  // Available options = active roster − already-selected.
  const selectedIds = new Set(value.map(v => v.instructor_id).filter((x): x is number => x != null));
  const filtered = options
    .filter(o => o.active && !selectedIds.has(o.id))
    .filter(o => o.name.toLowerCase().includes(query.trim().toLowerCase()));

  // Group roster vs visiting — team-linked first (they're the "on-staff"
  // pick), stubs (no team_member_id) trail as "Visiting / stubs".
  const staffed = filtered.filter(o => o.team_member_id != null);
  const visiting = filtered.filter(o => o.team_member_id == null);

  const rawQuery = query.trim();
  const exactMatch = rawQuery.length > 0 &&
    options.some(o => o.name.trim().toLowerCase() === rawQuery.toLowerCase());
  const canCreate = allowCreate && rawQuery.length >= 1 && !exactMatch && value.length < max;

  // Flat list of selectable items (options followed by "Create …"). Used
  // for keyboard navigation indices.
  const navList: Array<
    | { kind: "option"; option: InstructorOption }
    | { kind: "create"; name: string }
  > = [
    ...staffed.map(option => ({ kind: "option" as const, option })),
    ...visiting.map(option => ({ kind: "option" as const, option })),
    ...(canCreate ? [{ kind: "create" as const, name: rawQuery }] : []),
  ];

  useEffect(() => { setActiveIdx(0); }, [query, open]);

  // Close on outside click.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const atMax = value.length >= max;

  function addOption(option: InstructorOption) {
    if (atMax) return;
    onChange([...value, { instructor_id: option.id, name: option.name }]);
    setQuery("");
    inputRef.current?.focus();
  }
  function addStub(name: string) {
    if (atMax) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([...value, { name: trimmed, instructor_id: null }]);
    setQuery("");
    inputRef.current?.focus();
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
    inputRef.current?.focus();
  }

  function commitActive() {
    const item = navList[activeIdx];
    if (!item) return;
    if (item.kind === "option") addOption(item.option);
    else addStub(item.name);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      setOpen(true);
      setActiveIdx(i => Math.min(i + 1, Math.max(navList.length - 1, 0)));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIdx(i => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (open && navList.length > 0) {
        commitActive();
        e.preventDefault();
      } else if (canCreate) {
        addStub(rawQuery);
        e.preventDefault();
      }
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      removeAt(value.length - 1);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Any stubs present → show warning about the analytics trade-off.
  const hasStubs = value.some(v => v.instructor_id == null);

  return (
    <div
      ref={rootRef}
      className={`relative ${compact ? "" : ""}`}
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-haspopup="listbox"
      aria-owns={listboxId}
    >
      {/* Chip + input row */}
      <div
        className={`min-h-[2.5rem] w-full flex items-center flex-wrap gap-1.5 rounded border border-line bg-white px-2 py-1.5 focus-within:border-black transition-colors ${atMax ? "bg-paper/50" : ""}`}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((sel, i) => {
          const isPrimary = i === 0;
          const isStub = sel.instructor_id == null;
          return (
            <span
              key={`${sel.instructor_id ?? "stub"}-${i}`}
              className={`inline-flex items-center gap-1 rounded-full text-xs pl-2 pr-1 py-1 border ${
                isStub
                  ? "bg-status-alert-light text-ink border-status-alert-border"
                  : isPrimary
                    ? "bg-black text-white border-black"
                    : "bg-paper text-ink border-line"
              }`}
              title={isPrimary ? "Primary instructor" : undefined}
            >
              <span className="font-medium truncate max-w-[8rem]">{sel.name}</span>
              {isStub && (
                <span className="uppercase text-[9px] tracking-wider opacity-70">new</span>
              )}
              <button
                type="button"
                aria-label={`Remove ${sel.name}`}
                onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                className={`rounded-full p-0.5 ${isPrimary ? "hover:bg-white/20" : "hover:bg-line"} transition-colors`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        {!atMax && (
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[8rem] bg-transparent text-sm text-ink placeholder:text-muted outline-none"
            autoComplete="off"
            aria-autocomplete="list"
            aria-activedescendant={navList[activeIdx]
              ? `${listboxId}-opt-${activeIdx}`
              : undefined}
          />
        )}
      </div>

      {/* Helper + stub warning line */}
      {(helperText !== "" || hasStubs) && (
        <div className="mt-1 min-h-[1rem] text-[11px] text-muted flex items-center gap-2" aria-live="polite">
          {hasStubs && showStubWarning ? (
            <span className="text-ink">
              Using one or more ad-hoc names. They&apos;ll be created as instructors on save.
            </span>
          ) : helperText !== undefined ? (
            <span>{helperText}</span>
          ) : (
            <span>
              {atMax
                ? `Max ${max} instructors per class.`
                : "Type to search or add. Press Enter to pick."}
            </span>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && (staffed.length + visiting.length > 0 || canCreate) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white border border-line rounded-md shadow-lg max-h-64 overflow-y-auto text-sm"
        >
          {staffed.length > 0 && (
            <li className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5 bg-paper/60" role="presentation">
              <Users className="w-3 h-3" /> Team
            </li>
          )}
          {staffed.map((opt, i) => {
            const idx = i;
            const active = idx === activeIdx;
            return (
              <li
                key={opt.id}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); addOption(opt); }}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-3 ${active ? "bg-paper" : "hover:bg-paper/50"}`}
              >
                <span className="truncate text-ink">{opt.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted">instructor</span>
              </li>
            );
          })}
          {visiting.length > 0 && (
            <li className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5 bg-paper/60" role="presentation">
              <UserPlus className="w-3 h-3" /> Visiting / stubs
            </li>
          )}
          {visiting.map((opt, i) => {
            const idx = staffed.length + i;
            const active = idx === activeIdx;
            return (
              <li
                key={opt.id}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); addOption(opt); }}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-3 ${active ? "bg-paper" : "hover:bg-paper/50"}`}
              >
                <span className="truncate text-ink">{opt.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted">visiting</span>
              </li>
            );
          })}
          {canCreate && (() => {
            const idx = staffed.length + visiting.length;
            const active = idx === activeIdx;
            return (
              <li
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); addStub(rawQuery); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 border-t border-line ${active ? "bg-status-alert-light" : "hover:bg-paper/50"}`}
              >
                <Plus className="w-3.5 h-3.5 text-muted" />
                <span className="text-ink">
                  Create <span className="font-semibold">&quot;{rawQuery}&quot;</span>
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">as stub</span>
              </li>
            );
          })()}
        </ul>
      )}
    </div>
  );
}
