"use client";

/**
 * Combined picker for the four class-taxonomy dimensions (modality /
 * level / focus / audience). Lives inside the schedule modal.
 *
 * Structural patterns (chip row, searchable dropdown, `Create "X"` row,
 * keyboard nav with arrow keys + Enter + Backspace-on-empty + Escape)
 * mirror `InstructorCombobox` so the feel is consistent across admin
 * surfaces.
 *
 * Inline-create UX:
 *   - Modality / Level / Focus / Rank-or-Access audience → inline "Create"
 *     row in the dropdown. The parent passes an `onCreate*` callback that
 *     awaits the server action and merges the fresh row into the options
 *     list. The picker auto-selects the new row on success.
 *   - Age / Gender audience → sub-modal (those kinds need metadata the
 *     picker can't infer from a bare name).
 *
 * Auto-title — see §4.1.1. Parent passes `onAutoTitle`; this component
 * emits the generated string whenever a dimension changes AND the parent's
 * gate (title empty OR matches last generated) allows regeneration.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { X, Plus, ChevronDown } from "lucide-react";
import type {
  ClassModality,
  ClassLevel,
  ClassFocus,
  ClassAudience,
  AudienceKind,
} from "@/lib/supabase/types";

// ── Public props ────────────────────────────────────────────────────────

export interface ClassTaxonomyPickerProps {
  modalityId: number | null;
  levelId: number | null;
  focusIds: number[];
  audienceIds: number[];
  onChange: (next: {
    modality_id: number | null;
    level_id: number | null;
    focus_ids: number[];
    audience_ids: number[];
  }) => void;

  modalityOptions: ClassModality[];
  levelOptions: ClassLevel[];
  focusOptions: ClassFocus[];
  audienceOptions: ClassAudience[];

  /** Emits the auto-generated title whenever dimensions change. */
  onAutoTitle?: (title: string) => void;

  // ── Inline-create callbacks — parent calls the corresponding server
  //    action and returns the fresh row so the picker auto-selects it.
  onCreateModality?: (name: string) => Promise<ClassModality>;
  onCreateLevel?:    (name: string) => Promise<ClassLevel>;
  onCreateFocus?:    (name: string) => Promise<ClassFocus>;
  /** Audience inline-create for rank/access kinds only. Age/gender use the
   *  sub-modal, which the parent can surface via `onRequestAudienceModal`. */
  onCreateAudience?: (data: {
    name: string;
    kind: AudienceKind;
    min_age?: number | null;
    max_age?: number | null;
    gender?: "female" | "male" | null;
  }) => Promise<ClassAudience>;
}

// ── Shared primitives ───────────────────────────────────────────────────

const inputBaseCls =
  "flex-1 min-w-[6rem] bg-transparent text-sm text-ink placeholder:text-muted outline-none";

const chipBaseCls =
  "inline-flex items-center gap-1 rounded-full text-xs pl-2 pr-1 py-1 border bg-black text-white border-black";

const chipLightCls =
  "inline-flex items-center gap-1 rounded-full text-xs pl-2 pr-1 py-1 border bg-paper text-ink border-line";

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[10px] font-bold tracking-[0.1em] uppercase text-muted mb-1">
      {children}
    </label>
  );
}

// ── Auto-title ─────────────────────────────────────────────────────────
//
// Template (LLD §4.1.1):
//   <Modality>[ · <Level>][ · <focus1>/<focus2>][ · <aud1>/<aud2>]
// Separator ` · ` (U+00B7 MIDDLE DOT). Items within a section joined with ` / `.

function buildAutoTitle(
  modality: ClassModality | null,
  level: ClassLevel | null,
  focuses: ClassFocus[],
  audiences: ClassAudience[],
): string {
  const parts: string[] = [];
  if (modality) parts.push(modality.name);
  if (level) parts.push(level.name);
  if (focuses.length > 0) parts.push(focuses.map(f => f.name).join(" / "));
  if (audiences.length > 0) parts.push(audiences.map(a => a.name).join(" / "));
  return parts.join(" \u00B7 ");
}

// ── ModalityPicker — single-select, inline create ──────────────────────

interface ModalityPickerProps {
  value: number | null;
  onChange: (next: number | null) => void;
  options: ClassModality[];
  onCreate?: (name: string) => Promise<ClassModality>;
}

function ModalityPicker({ value, onChange, options, onCreate }: ModalityPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useMemo(() => `modality-lb-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => { setActiveIdx(0); }, [query, open]);
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const selected = useMemo(
    () => options.find(o => o.id === value) ?? null,
    [options, value],
  );

  const rawQuery = query.trim();
  const filtered = options
    .filter(o => o.active || o.id === value)
    .filter(o => o.name.toLowerCase().includes(rawQuery.toLowerCase()));
  const exactMatch = rawQuery.length > 0 &&
    options.some(o => o.name.trim().toLowerCase() === rawQuery.toLowerCase());
  const canCreate = Boolean(onCreate) && rawQuery.length >= 1 && !exactMatch && !creating;

  const navLen = filtered.length + (canCreate ? 1 : 0);

  async function commitCreate(name: string) {
    if (!onCreate || creating) return;
    try {
      setCreating(true);
      const row = await onCreate(name);
      onChange(row.id);
      setQuery("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  function commitActive() {
    if (activeIdx < filtered.length) {
      const opt = filtered[activeIdx];
      onChange(opt.id);
      setQuery("");
      setOpen(false);
    } else if (canCreate) {
      void commitCreate(rawQuery);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      setOpen(true);
      setActiveIdx(i => Math.min(i + 1, Math.max(navLen - 1, 0)));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIdx(i => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (open && navLen > 0) {
        commitActive();
        e.preventDefault();
      }
    } else if (e.key === "Backspace" && query === "" && selected) {
      onChange(null);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-haspopup="listbox"
    >
      <div
        className="min-h-[2.5rem] w-full flex items-center flex-wrap gap-1.5 rounded border border-line bg-white px-2 py-1.5 focus-within:border-black transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {selected && query === "" && (
          <span className={chipBaseCls} title={selected.name}>
            {selected.color && (
              <span
                className="w-2 h-2 rounded-full border border-white/40"
                style={{ backgroundColor: selected.color }}
                aria-hidden
              />
            )}
            <span className="font-medium truncate max-w-[10rem]">{selected.name}</span>
            <button
              type="button"
              aria-label={`Remove ${selected.name}`}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="rounded-full p-0.5 hover:bg-white/20 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected ? "" : "Search or add a modality…"}
          className={inputBaseCls}
          autoComplete="off"
          aria-autocomplete="list"
        />
        <ChevronDown className="w-3.5 h-3.5 text-muted" aria-hidden />
      </div>

      {open && (filtered.length > 0 || canCreate) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white border border-line rounded-md shadow-lg max-h-64 overflow-y-auto text-sm"
        >
          {filtered.map((opt, i) => {
            const active = i === activeIdx;
            return (
              <li
                key={opt.id}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); onChange(opt.id); setQuery(""); setOpen(false); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${active ? "bg-paper" : "hover:bg-paper/50"}`}
              >
                {opt.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-line shrink-0"
                    style={{ backgroundColor: opt.color }}
                    aria-hidden
                  />
                )}
                <span className="truncate text-ink">{opt.name}</span>
                {!opt.active && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">inactive</span>
                )}
              </li>
            );
          })}
          {canCreate && (() => {
            const idx = filtered.length;
            const active = idx === activeIdx;
            return (
              <li
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); void commitCreate(rawQuery); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 border-t border-line ${active ? "bg-status-alert-light" : "hover:bg-paper/50"}`}
              >
                <Plus className="w-3.5 h-3.5 text-muted" />
                <span className="text-ink">
                  Create <span className="font-semibold">&quot;{rawQuery}&quot;</span>
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">{creating ? "saving…" : "new"}</span>
              </li>
            );
          })()}
        </ul>
      )}
    </div>
  );
}

// ── LevelPicker — single-select with None + inline create ──────────────

interface LevelPickerProps {
  value: number | null;
  onChange: (next: number | null) => void;
  options: ClassLevel[];
  onCreate?: (name: string) => Promise<ClassLevel>;
}

function LevelPicker({ value, onChange, options, onCreate }: LevelPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useMemo(() => `level-lb-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => { setActiveIdx(0); }, [query, open]);
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const selected = useMemo(() => options.find(o => o.id === value) ?? null, [options, value]);

  const rawQuery = query.trim();
  const filtered = options
    .filter(o => o.active || o.id === value)
    .filter(o => o.name.toLowerCase().includes(rawQuery.toLowerCase()));
  const exactMatch = rawQuery.length > 0 &&
    options.some(o => o.name.trim().toLowerCase() === rawQuery.toLowerCase());
  const showNoneRow = rawQuery === "" && value !== null;
  const noneRowCount = showNoneRow ? 1 : 0;
  const canCreate = Boolean(onCreate) && rawQuery.length >= 1 && !exactMatch && !creating;
  const navLen = noneRowCount + filtered.length + (canCreate ? 1 : 0);

  async function commitCreate(name: string) {
    if (!onCreate || creating) return;
    try {
      setCreating(true);
      const row = await onCreate(name);
      onChange(row.id);
      setQuery("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  function commitActive() {
    let idx = activeIdx;
    if (showNoneRow && idx === 0) {
      onChange(null);
      setQuery("");
      setOpen(false);
      return;
    }
    idx -= noneRowCount;
    if (idx < filtered.length) {
      const opt = filtered[idx];
      onChange(opt.id);
      setQuery("");
      setOpen(false);
    } else if (canCreate) {
      void commitCreate(rawQuery);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      setOpen(true);
      setActiveIdx(i => Math.min(i + 1, Math.max(navLen - 1, 0)));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIdx(i => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (open && navLen > 0) { commitActive(); e.preventDefault(); }
    } else if (e.key === "Backspace" && query === "" && selected) {
      onChange(null);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-haspopup="listbox"
    >
      <div
        className="min-h-[2.5rem] w-full flex items-center flex-wrap gap-1.5 rounded border border-line bg-white px-2 py-1.5 focus-within:border-black transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {selected && query === "" && (
          <span className={chipBaseCls} title={selected.name}>
            <span className="font-medium truncate max-w-[10rem]">{selected.name}</span>
            <button
              type="button"
              aria-label={`Remove ${selected.name}`}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="rounded-full p-0.5 hover:bg-white/20 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected ? "" : "Any level (None) or pick one…"}
          className={inputBaseCls}
          autoComplete="off"
          aria-autocomplete="list"
        />
        <ChevronDown className="w-3.5 h-3.5 text-muted" aria-hidden />
      </div>

      {open && (filtered.length > 0 || canCreate || showNoneRow) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white border border-line rounded-md shadow-lg max-h-64 overflow-y-auto text-sm"
        >
          {showNoneRow && (() => {
            const idx = 0;
            const active = idx === activeIdx;
            return (
              <li
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); onChange(null); setQuery(""); setOpen(false); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 border-b border-line ${active ? "bg-paper" : "hover:bg-paper/50"}`}
              >
                <span className="italic text-muted">No level (clear)</span>
              </li>
            );
          })()}
          {filtered.map((opt, i) => {
            const idx = noneRowCount + i;
            const active = idx === activeIdx;
            return (
              <li
                key={opt.id}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); onChange(opt.id); setQuery(""); setOpen(false); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${active ? "bg-paper" : "hover:bg-paper/50"}`}
              >
                <span className="truncate text-ink">{opt.name}</span>
                {!opt.active && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">inactive</span>
                )}
              </li>
            );
          })}
          {canCreate && (() => {
            const idx = noneRowCount + filtered.length;
            const active = idx === activeIdx;
            return (
              <li
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); void commitCreate(rawQuery); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 border-t border-line ${active ? "bg-status-alert-light" : "hover:bg-paper/50"}`}
              >
                <Plus className="w-3.5 h-3.5 text-muted" />
                <span className="text-ink">
                  Create <span className="font-semibold">&quot;{rawQuery}&quot;</span>
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">{creating ? "saving…" : "new"}</span>
              </li>
            );
          })()}
        </ul>
      )}
    </div>
  );
}

// ── FocusCombobox — multi-select + inline create ───────────────────────

interface FocusComboboxProps {
  value: number[];
  onChange: (next: number[]) => void;
  options: ClassFocus[];
  onCreate?: (name: string) => Promise<ClassFocus>;
}

function FocusCombobox({ value, onChange, options, onCreate }: FocusComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useMemo(() => `focus-lb-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => { setActiveIdx(0); }, [query, open]);
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const selectedSet = new Set(value);
  const selectedRows = value
    .map(id => options.find(o => o.id === id))
    .filter((o): o is ClassFocus => !!o);

  const rawQuery = query.trim();
  const filtered = options
    .filter(o => o.active && !selectedSet.has(o.id))
    .filter(o => o.name.toLowerCase().includes(rawQuery.toLowerCase()));
  const exactMatch = rawQuery.length > 0 &&
    options.some(o => o.name.trim().toLowerCase() === rawQuery.toLowerCase());
  const canCreate = Boolean(onCreate) && rawQuery.length >= 1 && !exactMatch && !creating;
  const navLen = filtered.length + (canCreate ? 1 : 0);

  function addId(id: number) {
    if (selectedSet.has(id)) return;
    onChange([...value, id]);
    setQuery("");
    inputRef.current?.focus();
  }

  async function commitCreate(name: string) {
    if (!onCreate || creating) return;
    try {
      setCreating(true);
      const row = await onCreate(name);
      onChange([...value, row.id]);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  function commitActive() {
    if (activeIdx < filtered.length) {
      addId(filtered[activeIdx].id);
    } else if (canCreate) {
      void commitCreate(rawQuery);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      setOpen(true);
      setActiveIdx(i => Math.min(i + 1, Math.max(navLen - 1, 0)));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIdx(i => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (open && navLen > 0) { commitActive(); e.preventDefault(); }
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-haspopup="listbox"
    >
      <div
        className="min-h-[2.5rem] w-full flex items-center flex-wrap gap-1.5 rounded border border-line bg-white px-2 py-1.5 focus-within:border-black transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedRows.map((row, i) => (
          <span key={row.id} className={chipLightCls} title={row.name}>
            <span className="font-medium truncate max-w-[9rem]">{row.name}</span>
            <button
              type="button"
              aria-label={`Remove ${row.name}`}
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((_, idx) => idx !== i)); }}
              className="rounded-full p-0.5 hover:bg-line transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? "Tag technique or theme…" : ""}
          className={inputBaseCls}
          autoComplete="off"
          aria-autocomplete="list"
        />
        <ChevronDown className="w-3.5 h-3.5 text-muted" aria-hidden />
      </div>

      {open && (filtered.length > 0 || canCreate) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white border border-line rounded-md shadow-lg max-h-64 overflow-y-auto text-sm"
        >
          {filtered.map((opt, i) => {
            const active = i === activeIdx;
            return (
              <li
                key={opt.id}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); addId(opt.id); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${active ? "bg-paper" : "hover:bg-paper/50"}`}
              >
                <span className="truncate text-ink">{opt.name}</span>
              </li>
            );
          })}
          {canCreate && (() => {
            const idx = filtered.length;
            const active = idx === activeIdx;
            return (
              <li
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); void commitCreate(rawQuery); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 border-t border-line ${active ? "bg-status-alert-light" : "hover:bg-paper/50"}`}
              >
                <Plus className="w-3.5 h-3.5 text-muted" />
                <span className="text-ink">
                  Create <span className="font-semibold">&quot;{rawQuery}&quot;</span>
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">{creating ? "saving…" : "new"}</span>
              </li>
            );
          })()}
        </ul>
      )}
    </div>
  );
}

// ── Audience sub-modal for age / gender inline-create ──────────────────

interface AudienceModalState {
  kind: "age" | "gender";
  defaultName: string;
}

function AudienceCreateModal({
  state,
  onCancel,
  onConfirm,
  busy,
}: {
  state: AudienceModalState;
  onCancel: () => void;
  onConfirm: (data: {
    name: string;
    kind: "age" | "gender";
    min_age?: number | null;
    max_age?: number | null;
    gender?: "female" | "male" | null;
  }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(state.defaultName);
  const [minAge, setMinAge] = useState<string>("");
  const [maxAge, setMaxAge] = useState<string>("");
  const [gender, setGender] = useState<"female" | "male" | null>(null);

  function canSubmit() {
    if (!name.trim()) return false;
    if (state.kind === "age") {
      return minAge !== "" || maxAge !== "";
    }
    return gender !== null;
  }

  function submit() {
    if (!canSubmit()) return;
    if (state.kind === "age") {
      onConfirm({
        name: name.trim(),
        kind: "age",
        min_age: minAge === "" ? null : Number(minAge),
        max_age: maxAge === "" ? null : Number(maxAge),
      });
    } else {
      onConfirm({ name: name.trim(), kind: "gender", gender });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Create ${state.kind} audience`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-md bg-white rounded-lg border border-line shadow-xl p-5">
        <h3 className="font-display text-xl text-black mb-4">
          {state.kind === "age" ? "New age audience" : "New gender audience"}
        </h3>
        <div className="space-y-3">
          <div>
            <FieldLabel>Name</FieldLabel>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={state.kind === "age" ? "Ages 7–10" : "Women Only"}
              className="w-full border border-line rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-black"
            />
          </div>
          {state.kind === "age" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Min age</FieldLabel>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={minAge}
                  onChange={(e) => setMinAge(e.target.value)}
                  placeholder="3"
                  className="w-full border border-line rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <FieldLabel>Max age</FieldLabel>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={maxAge}
                  onChange={(e) => setMaxAge(e.target.value)}
                  placeholder="10"
                  className="w-full border border-line rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-black"
                />
              </div>
            </div>
          ) : (
            <div>
              <FieldLabel>Gender</FieldLabel>
              <div className="flex gap-1.5">
                {(["male", "female"] as const).map((g) => {
                  const active = gender === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(active ? null : g)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold border transition-all cursor-pointer ${
                        active ? "bg-black text-white border-black" : "bg-white text-ink border-line hover:border-black"
                      }`}
                    >
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-sm px-4 py-2 border border-line rounded-md hover:border-black transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !canSubmit()}
            className="text-sm px-5 py-2 bg-black text-white rounded-md hover:bg-near-black disabled:opacity-50 transition-colors font-semibold"
          >
            {busy ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AudienceCombobox — multi-select grouped by kind, with sub-modal ────

interface AudienceComboboxProps {
  value: number[];
  onChange: (next: number[]) => void;
  options: ClassAudience[];
  onCreate?: (data: {
    name: string;
    kind: AudienceKind;
    min_age?: number | null;
    max_age?: number | null;
    gender?: "female" | "male" | null;
  }) => Promise<ClassAudience>;
}

const AUDIENCE_KIND_ORDER: AudienceKind[] = ["age", "gender", "rank", "access"];
const AUDIENCE_KIND_LABELS: Record<AudienceKind, string> = {
  age:    "Age",
  gender: "Gender",
  rank:   "Rank",
  access: "Access",
};

function AudienceCombobox({ value, onChange, options, onCreate }: AudienceComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState<AudienceModalState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useMemo(() => `audience-lb-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => { setActiveIdx(0); }, [query, open]);
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (modal) return;
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [modal]);

  const selectedSet = new Set(value);
  const selectedRows = value
    .map(id => options.find(o => o.id === id))
    .filter((o): o is ClassAudience => !!o);

  const rawQuery = query.trim();
  const filtered = options
    .filter(o => o.active && !selectedSet.has(o.id))
    .filter(o => o.name.toLowerCase().includes(rawQuery.toLowerCase()));
  const exactMatch = rawQuery.length > 0 &&
    options.some(o => o.name.trim().toLowerCase() === rawQuery.toLowerCase());

  // Build grouped flat nav list: [...ageOpts, ...genderOpts, ...rankOpts, ...accessOpts, ...createRows]
  // Create rows offered for each kind when allowed and query is novel.
  const grouped = AUDIENCE_KIND_ORDER.map(k => ({
    kind: k,
    rows: filtered.filter(o => o.kind === k),
  }));

  type CreateRow = { kind: AudienceKind };
  const createRows: CreateRow[] = Boolean(onCreate) && rawQuery.length >= 1 && !exactMatch && !creating
    ? AUDIENCE_KIND_ORDER.map(k => ({ kind: k }))
    : [];

  // Flat nav: sequence of options, then createRows.
  const navSequence: Array<
    | { kind: "option"; option: ClassAudience }
    | { kind: "create"; audienceKind: AudienceKind }
  > = [];
  for (const g of grouped) {
    for (const row of g.rows) navSequence.push({ kind: "option", option: row });
  }
  for (const c of createRows) navSequence.push({ kind: "create", audienceKind: c.kind });
  const navLen = navSequence.length;

  function addId(id: number) {
    if (selectedSet.has(id)) return;
    onChange([...value, id]);
    setQuery("");
    inputRef.current?.focus();
  }

  async function commitInlineCreate(kind: "rank" | "access", name: string) {
    if (!onCreate || creating) return;
    try {
      setCreating(true);
      const row = await onCreate({ name, kind });
      onChange([...value, row.id]);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  function openCreateFor(kind: AudienceKind) {
    if (kind === "age" || kind === "gender") {
      setModal({ kind, defaultName: rawQuery });
    } else {
      void commitInlineCreate(kind, rawQuery);
    }
  }

  async function handleModalConfirm(data: {
    name: string;
    kind: "age" | "gender";
    min_age?: number | null;
    max_age?: number | null;
    gender?: "female" | "male" | null;
  }) {
    if (!onCreate || creating) return;
    try {
      setCreating(true);
      const row = await onCreate(data);
      onChange([...value, row.id]);
      setModal(null);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  function commitActive() {
    const item = navSequence[activeIdx];
    if (!item) return;
    if (item.kind === "option") addId(item.option.id);
    else openCreateFor(item.audienceKind);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      setOpen(true);
      setActiveIdx(i => Math.min(i + 1, Math.max(navLen - 1, 0)));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIdx(i => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (open && navLen > 0) { commitActive(); e.preventDefault(); }
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Flat index helper — row-by-row assigned indices mirror `navSequence`.
  function optionIdx(aud: ClassAudience): number {
    return navSequence.findIndex(n => n.kind === "option" && n.option.id === aud.id);
  }
  function createIdx(kind: AudienceKind): number {
    return navSequence.findIndex(n => n.kind === "create" && n.audienceKind === kind);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-haspopup="listbox"
    >
      <div
        className="min-h-[2.5rem] w-full flex items-center flex-wrap gap-1.5 rounded border border-line bg-white px-2 py-1.5 focus-within:border-black transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedRows.map((row, i) => (
          <span key={row.id} className={chipLightCls} title={`${AUDIENCE_KIND_LABELS[row.kind]} • ${row.name}`}>
            <span className="text-[9px] uppercase tracking-wider text-muted">{AUDIENCE_KIND_LABELS[row.kind]}</span>
            <span className="font-medium truncate max-w-[9rem]">{row.name}</span>
            <button
              type="button"
              aria-label={`Remove ${row.name}`}
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((_, idx) => idx !== i)); }}
              className="rounded-full p-0.5 hover:bg-line transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? "Audience gates (age, gender, rank, access)…" : ""}
          className={inputBaseCls}
          autoComplete="off"
          aria-autocomplete="list"
        />
        <ChevronDown className="w-3.5 h-3.5 text-muted" aria-hidden />
      </div>

      {open && navLen > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white border border-line rounded-md shadow-lg max-h-72 overflow-y-auto text-sm"
        >
          {grouped.map(g => (
            g.rows.length > 0 ? (
              <div key={g.kind}>
                <li
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted bg-paper/60"
                  role="presentation"
                >
                  {AUDIENCE_KIND_LABELS[g.kind]}
                </li>
                {g.rows.map(opt => {
                  const idx = optionIdx(opt);
                  const active = idx === activeIdx;
                  return (
                    <li
                      key={opt.id}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onMouseDown={(e) => { e.preventDefault(); addId(opt.id); }}
                      className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${active ? "bg-paper" : "hover:bg-paper/50"}`}
                    >
                      <span className="truncate text-ink">{opt.name}</span>
                      {opt.kind === "age" && (opt.min_age !== null || opt.max_age !== null) && (
                        <span className="ml-auto text-[10px] text-muted tabular-nums">
                          {opt.min_age ?? 0}–{opt.max_age ?? "∞"}
                        </span>
                      )}
                      {opt.kind === "gender" && opt.gender && (
                        <span className="ml-auto text-[10px] text-muted capitalize">{opt.gender}</span>
                      )}
                    </li>
                  );
                })}
              </div>
            ) : null
          ))}
          {createRows.length > 0 && (
            <li
              className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted bg-paper/60 border-t border-line"
              role="presentation"
            >
              Create new
            </li>
          )}
          {createRows.map(c => {
            const idx = createIdx(c.kind);
            const active = idx === activeIdx;
            const needsModal = c.kind === "age" || c.kind === "gender";
            return (
              <li
                key={`create-${c.kind}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); openCreateFor(c.kind); }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${active ? "bg-status-alert-light" : "hover:bg-paper/50"}`}
              >
                <Plus className="w-3.5 h-3.5 text-muted" />
                <span className="text-ink">
                  Create <span className="font-semibold">&quot;{rawQuery}&quot;</span> as {AUDIENCE_KIND_LABELS[c.kind]}
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">
                  {creating ? "saving…" : needsModal ? "needs details" : "new"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {modal && (
        <AudienceCreateModal
          state={modal}
          busy={creating}
          onCancel={() => setModal(null)}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  );
}

// ── Composite picker ───────────────────────────────────────────────────

export default function ClassTaxonomyPicker({
  modalityId,
  levelId,
  focusIds,
  audienceIds,
  onChange,
  modalityOptions,
  levelOptions,
  focusOptions,
  audienceOptions,
  onAutoTitle,
  onCreateModality,
  onCreateLevel,
  onCreateFocus,
  onCreateAudience,
}: ClassTaxonomyPickerProps) {
  // Re-emit auto-title whenever dimensions change. The parent decides
  // whether to actually apply it (it tracks user edits to the title input).
  const modality = useMemo(
    () => modalityOptions.find(m => m.id === modalityId) ?? null,
    [modalityOptions, modalityId],
  );
  const level = useMemo(
    () => levelOptions.find(l => l.id === levelId) ?? null,
    [levelOptions, levelId],
  );
  const focuses = useMemo(
    () => focusIds.map(id => focusOptions.find(f => f.id === id)).filter((f): f is ClassFocus => !!f),
    [focusOptions, focusIds],
  );
  const audiences = useMemo(
    () => audienceIds.map(id => audienceOptions.find(a => a.id === id)).filter((a): a is ClassAudience => !!a),
    [audienceOptions, audienceIds],
  );

  const title = useMemo(
    () => buildAutoTitle(modality, level, focuses, audiences),
    [modality, level, focuses, audiences],
  );

  // Fire on every change. The parent already guards (only applies when
  // user hasn't manually edited the title input since the last emission).
  useEffect(() => {
    if (onAutoTitle) onAutoTitle(title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  function emit(patch: Partial<{
    modality_id: number | null;
    level_id: number | null;
    focus_ids: number[];
    audience_ids: number[];
  }>) {
    onChange({
      modality_id: patch.modality_id !== undefined ? patch.modality_id : modalityId,
      level_id:    patch.level_id    !== undefined ? patch.level_id    : levelId,
      focus_ids:   patch.focus_ids   !== undefined ? patch.focus_ids   : focusIds,
      audience_ids: patch.audience_ids !== undefined ? patch.audience_ids : audienceIds,
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
      <div>
        <FieldLabel>Modality *</FieldLabel>
        <ModalityPicker
          value={modalityId}
          onChange={(next) => emit({ modality_id: next })}
          options={modalityOptions}
          onCreate={onCreateModality}
        />
      </div>
      <div>
        <FieldLabel>Level (optional)</FieldLabel>
        <LevelPicker
          value={levelId}
          onChange={(next) => emit({ level_id: next })}
          options={levelOptions}
          onCreate={onCreateLevel}
        />
      </div>
      <div className="md:col-span-2">
        <FieldLabel>Focus</FieldLabel>
        <FocusCombobox
          value={focusIds}
          onChange={(next) => emit({ focus_ids: next })}
          options={focusOptions}
          onCreate={onCreateFocus}
        />
      </div>
      <div className="md:col-span-2">
        <FieldLabel>Audiences</FieldLabel>
        <AudienceCombobox
          value={audienceIds}
          onChange={(next) => emit({ audience_ids: next })}
          options={audienceOptions}
          onCreate={onCreateAudience}
        />
        <p className="text-[10px] text-muted/60 mt-1">
          Kiosk warns on age/gender mismatch; rank/access surface as advisories.
        </p>
      </div>
    </div>
  );
}
