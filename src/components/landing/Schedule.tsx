"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ExternalLink, MoreVertical, Plus } from "lucide-react";
import { ClassType, CLASS_TYPE_CONFIG, DAYS_OF_WEEK, type DayOfWeek } from "@/lib/constants";
import { getTodayName } from "@/lib/utils";
import type { ScheduleSlot, ClassModality } from "@/lib/supabase/types";
import {
  buildIssueMap,
  ISSUE_DEFS,
  type IssueCode,
} from "./schedule-issues";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }

/**
 * Public-schedule slot enriched with its modality snapshot and audience
 * labels. The server (`ScheduleSection.tsx`) joins `class_modalities` +
 * `schedule_slot_audiences` → `class_audiences` and flattens the fields
 * so this client component stays free of Supabase imports.
 *
 * `modality_slug` is null only in the rare pre-Phase-3 edge case where
 * a slot escaped the backfill. Post-Phase-3 `modality_id` is NOT NULL
 * at the DB level, so this should always populate.
 */
export interface EnrichedScheduleSlot extends ScheduleSlot {
  modality_slug: string | null;
  modality_name: string | null;
  modality_color: string | null;
  /** Current level display name — server-joined from `class_levels`. */
  level_name: string | null;
  /** Audience names in sort order ("Ages 7-10", "Women Only", etc.).
   *  Empty array = open class. Replaces the pre-taxonomy `audience_note`
   *  free-text column. */
  audience_names: string[];
}

/**
 * Optional admin-mode extensions. When `adminMode` is true, every
 * `<ClassBlock>` becomes interactive: click → edit, hover → overflow
 * menu with per-card actions, inactive slots render dashed+dimmed, and
 * cards missing taxonomy attribution can optionally highlight. Public
 * callers (landing page) never pass these props; admin is the sole
 * consumer. Contained in one block so future admin polish doesn't
 * scatter `if (adminMode)` branches across the component.
 */
export interface AdminModeHandlers {
  onEditSlot?: (slot: EnrichedScheduleSlot) => void;
  onAddSlot?: (dayOfWeek: number) => void;
  onToggleActive?: (slotId: number, currentActive: boolean) => void;
  onDuplicate?: (slot: EnrichedScheduleSlot) => void;
  onDelete?: (slotId: number) => void;
}

interface Props extends AdminModeHandlers {
  schedule: EnrichedScheduleSlot[];
  modalityOptions: ClassModality[];
  sectionConfig?: SectionConfig;
  /** When true, render click-to-edit cards + hover overflow menu,
   *  hide the public marketing header, and allow inactive slots to
   *  surface (caller is expected to include inactive rows in `schedule`). */
  adminMode?: boolean;
  /** Admin-only. When true, cards missing an instructor (and not an
   *  Open Mat) show a yellow warning ring. Helps owners catch
   *  configuration gaps before members see them. */
  highlightIssues?: boolean;
}

// ── Derive ClassType from modality slug (for color rendering only) ────────
// Modality is NOT NULL post-Phase-3; unknown slugs (owner-added modalities
// like "Judo") fall back to the neutral Gi theme until the card's own
// `modality_color` hex is wired through end-to-end.
function slotClassType(slot: EnrichedScheduleSlot): ClassType {
  switch (slot.modality_slug) {
    case "gi":                return ClassType.Gi;
    case "no-gi":             return ClassType.NoGi;
    case "kids":              return ClassType.Youth;
    case "open-mat":          return ClassType.OpenMat;
    case "competition-prep":  return ClassType.Special;
    case "conditioning":      return ClassType.Special;
    default:                  return ClassType.Gi;
  }
}

// ── Map day_of_week (1–7) to day name ────────────────────────────────────
function dayName(dow: number): DayOfWeek {
  return DAYS_OF_WEEK[dow - 1] as DayOfWeek;
}

// ── Spanish display labels (data keys stay English) ───────────────────────
const DAY_LABEL_ES: Record<DayOfWeek, string> = {
  Monday: "Lunes",
  Tuesday: "Martes",
  Wednesday: "Miércoles",
  Thursday: "Jueves",
  Friday: "Viernes",
  Saturday: "Sábado",
  Sunday: "Domingo",
};

const DAY_SHORT_ES: Record<DayOfWeek, string> = {
  Monday: "Lun",
  Tuesday: "Mar",
  Wednesday: "Mié",
  Thursday: "Jue",
  Friday: "Vie",
  Saturday: "Sáb",
  Sunday: "Dom",
};

// ── Concurrent-slot grouping ───────────────────────────────────────────────
interface TimeSlotGroup {
  time: string;
  entries: EnrichedScheduleSlot[];
}

function groupByTimeSlot(entries: EnrichedScheduleSlot[]): TimeSlotGroup[] {
  const map = new Map<string, EnrichedScheduleSlot[]>();
  for (const entry of entries) {
    const bucket = map.get(entry.start_time);
    if (bucket) bucket.push(entry);
    else map.set(entry.start_time, [entry]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => timeToMinutes(a) - timeToMinutes(b))
    .map(([time, entries]) => ({
      time,
      entries: [...entries].sort((a, b) => {
        const matA = a.area ?? "ZZZ";
        const matB = b.area ?? "ZZZ";
        return matA < matB ? -1 : matA > matB ? 1 : a.id - b.id;
      }),
    }));
}

// ── Modality filter ────────────────────────────────────────────────────────
// Filter chips are derived from live `class_modalities` rows (active-only,
// sort_order ascending). The "All" chip is prepended. Filter value is a
// modality slug string ("gi", "no-gi", …) so the admin can add / rename /
// deactivate modalities without the public schedule needing a code change.
// Visual dot uses the per-modality hex `color` when present; otherwise
// falls back to the ClassType config so existing-modality theming stays
// stable.
interface FilterChip {
  label: string;
  value: string; // "all" | modality slug
  dot?: string;  // tailwind class like "bg-blue-mid"
  dotHex?: string; // raw hex from class_modalities.color
}

function buildFilters(modalities: ClassModality[]): FilterChip[] {
  return [
    { label: "Todas", value: "all" },
    ...modalities.map((m) => {
      // Map known slugs back to the existing theme so nothing visually shifts
      // for the 5 seed modalities. New slugs rely on `color` or are neutral.
      const legacyTheme: Record<string, { dot: string }> = {
        "gi":               { dot: CLASS_TYPE_CONFIG[ClassType.Gi].dotColor },
        "no-gi":            { dot: CLASS_TYPE_CONFIG[ClassType.NoGi].dotColor },
        "kids":             { dot: CLASS_TYPE_CONFIG[ClassType.Youth].dotColor },
        "open-mat":         { dot: CLASS_TYPE_CONFIG[ClassType.OpenMat].dotColor },
        "competition-prep": { dot: CLASS_TYPE_CONFIG[ClassType.Special].dotColor },
      };
      const themed = legacyTheme[m.slug];
      return {
        label: m.name,
        value: m.slug,
        dot: themed?.dot,
        dotHex: !themed?.dot ? (m.color ?? undefined) : undefined,
      };
    }),
  ];
}

function matchesFilter(slot: EnrichedScheduleSlot, filter: string): boolean {
  if (filter === "all") return true;
  return slot.modality_slug === filter;
}

// ── Time-of-day filter ─────────────────────────────────────────────────────
type TimePeriod = "all" | "morning" | "afternoon" | "evening";

const TIME_FILTERS: { label: string; value: TimePeriod; hint: string }[] = [
  { label: "Todo el día", value: "all",       hint: "" },
  { label: "Mañana",      value: "morning",   hint: "hasta 12 p.m." },
  { label: "Tarde",       value: "afternoon", hint: "12–6 p.m." },
  { label: "Noche",       value: "evening",   hint: "después de 6 p.m." },
];

const PERIODS: Exclude<TimePeriod, "all">[] = ["morning", "afternoon", "evening"];

const PERIOD_LABEL: Record<Exclude<TimePeriod, "all">, string> = {
  morning:   "Mañana",
  afternoon: "Tarde",
  evening:   "Noche",
};

function timeToMinutes(time: string): number {
  const upper = time.trim().toUpperCase();
  const [hourStr, rest] = upper.split(":");
  let hour = parseInt(hourStr, 10);
  const minutes = parseInt(rest, 10);
  if (upper.includes("PM") && hour !== 12) hour += 12;
  if (upper.includes("AM") && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

function formatTime(time: string): string {
  const minutes = timeToMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
}

function getTimePeriod(time: string): Exclude<TimePeriod, "all"> {
  const minutes = timeToMinutes(time);
  if (minutes < 12 * 60) return "morning";
  if (minutes < 18 * 60) return "afternoon";
  return "evening";
}

// ── Link badge ─────────────────────────────────────────────────────────────
function LinkBadge({ label, url }: { label: string; url: string }) {
  const isInternal = url.startsWith("/") || url.startsWith("#");
  return (
    <a
      href={url}
      {...(!isInternal && { target: "_blank", rel: "noopener noreferrer" })}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border border-blue-100 bg-blue-50 text-blue-mid hover:bg-blue-100 transition-colors"
    >
      {label}
      {!isInternal && <ExternalLink className="w-2.5 h-2.5 inline" aria-hidden="true" />}
    </a>
  );
}

function AreaChip({ area }: { area: string }) {
  return (
    <span className="inline-block font-mono text-[9px] text-muted/70 bg-line/40 rounded-sm px-1 py-px leading-none mr-1">
      {area}
    </span>
  );
}

/**
 * Bundled context passed through the nested render tree whenever admin
 * mode is active. Keeping the callbacks together means ConcurrentGroup
 * / WeekDayColumn / etc. don't each have to list six optional props —
 * they just forward `admin`. `null`/undefined means "public mode".
 *
 * `issuesBySlotId` is precomputed once by the main Schedule component
 * (memoized on the slot-array identity) so per-card badge rendering
 * stays O(1) — the detector itself runs O(n) cross-slot scans and we
 * don't want that on every re-render.
 */
export interface AdminCardContext {
  highlightIssues: boolean;
  /** Present only when highlightIssues is true. Undefined elsewhere so
   *  callers can treat "no entry" as "this slot is clean". */
  issuesBySlotId?: Map<number, IssueCode[]>;
  onEditSlot?: (slot: EnrichedScheduleSlot) => void;
  onAddSlot?: (dayOfWeek: number) => void;
  onToggleActive?: (slotId: number, currentActive: boolean) => void;
  onDuplicate?: (slot: EnrichedScheduleSlot) => void;
  onDelete?: (slotId: number) => void;
}

/**
 * Hover-revealed overflow menu for admin class cards. Click dispatches
 * the corresponding callback; Escape closes the menu. Closes on any
 * outside click via a doc-level listener registered only while open
 * (cheap + self-cleaning, no context provider needed).
 */
function AdminCardMenu({
  slot,
  onEdit,
  onToggleActive,
  onDuplicate,
  onDelete,
}: {
  slot: EnrichedScheduleSlot;
  onEdit?: (slot: EnrichedScheduleSlot) => void;
  onToggleActive?: (slotId: number, currentActive: boolean) => void;
  onDuplicate?: (slot: EnrichedScheduleSlot) => void;
  onDelete?: (slotId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className={`w-6 h-6 flex items-center justify-center rounded text-muted hover:text-ink hover:bg-white/80 transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
        aria-label="Class actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-7 min-w-[140px] bg-white border border-line rounded-md shadow-lg py-1 text-xs z-20"
        >
          {onEdit && (
            <button
              type="button"
              role="menuitem"
              className="block w-full text-left px-3 py-1.5 hover:bg-paper text-ink"
              onClick={(e) => { e.stopPropagation(); run(() => onEdit(slot)); }}
            >
              Edit
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              role="menuitem"
              className="block w-full text-left px-3 py-1.5 hover:bg-paper text-ink"
              onClick={(e) => { e.stopPropagation(); run(() => onDuplicate(slot)); }}
            >
              Duplicate
            </button>
          )}
          {onToggleActive && (
            <button
              type="button"
              role="menuitem"
              className="block w-full text-left px-3 py-1.5 hover:bg-paper text-ink"
              onClick={(e) => { e.stopPropagation(); run(() => onToggleActive(slot.id, slot.active)); }}
            >
              {slot.active ? "Deactivate" : "Reactivate"}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              className="block w-full text-left px-3 py-1.5 hover:bg-danger-light text-danger border-t border-line"
              onClick={(e) => { e.stopPropagation(); run(() => onDelete(slot.id)); }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Dashed ghost cell rendered at the bottom of each day column in admin
 * mode. Click → `onAddSlot(dayOfWeek)` which the admin page wires to
 * its Add modal, pre-filled with that day. Visual affordance is
 * deliberately low-contrast so it doesn't compete with real classes
 * when the admin is scanning for data, but clearly actionable on
 * hover.
 */
function AdminAddSlotGhost({
  dayOfWeek,
  onAddSlot,
}: {
  dayOfWeek: number;
  onAddSlot: (dayOfWeek: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAddSlot(dayOfWeek)}
      className="w-full flex items-center justify-center gap-1 border border-dashed border-line/80 rounded py-3 text-[10px] font-semibold uppercase tracking-wider text-muted/60 hover:text-ink hover:border-ink hover:bg-paper transition-colors cursor-pointer"
    >
      <Plus className="w-3 h-3" />
      Add slot
    </button>
  );
}

function ClassBlock({
  c,
  showTime = true,
  admin,
}: {
  c: EnrichedScheduleSlot;
  showTime?: boolean;
  admin?: AdminCardContext | null;
}) {
  const cfg = CLASS_TYPE_CONFIG[slotClassType(c)];
  const levelLabel = c.level_name;
  const adminMode = !!admin;
  const inactive = adminMode && !c.active;
  const slotIssues = adminMode && admin!.highlightIssues
    ? admin!.issuesBySlotId?.get(c.id) ?? []
    : [];
  const hasError = slotIssues.some(code => ISSUE_DEFS[code].severity === "error");
  const hasIssues = slotIssues.length > 0;

  // Compose card styling — public stays untouched; admin adds dashed
  // outline on inactive + an attention-grabbing animation when the
  // issue-highlighter flags this slot. Severity hierarchy:
  //   - error-tier (duplicate / bad time / mat conflict) →
  //     pulsating red halo, 1.6s cycle ("urgent")
  //   - warn-only (no instructor) → dashed yellow outline +
  //     pulsating yellow halo, 2s cycle ("important, not urgent")
  // Both animations respect `prefers-reduced-motion` — see
  // `globals.css` for the static fallbacks.
  const ringClass = hasIssues
    ? hasError
      ? "animate-pulse-danger-ring"
      : "animate-pulse-warning-ring"
    : "";
  const cardClasses = [
    "relative border border-line border-l-[5px] rounded p-2.5 flex flex-col min-h-[80px] transition-colors duration-100",
    cfg.bgColor,
    cfg.hoverBg,
    adminMode ? "group" : "",
    inactive ? "border-dashed opacity-55" : "",
    ringClass,
  ].filter(Boolean).join(" ");

  const content = (
    <>
      {showTime && (
        <div className="font-mono text-[10px] text-muted mb-0.5 flex items-center gap-1">
          <span>{formatTime(c.start_time)}</span>
          {c.area && <><span className="text-muted/40">·</span><span>{c.area}</span></>}
        </div>
      )}
      {!showTime && c.area && (
        <div className="mb-1"><AreaChip area={c.area} /></div>
      )}

      <div className="text-xs font-semibold text-ink leading-snug">{c.title}</div>

      <div className="text-[10px] text-muted mt-0.5">
        {levelLabel}
        {c.show_instructor && c.instructor_name && (
          <span> · <span className="text-blue-mid font-medium">{c.instructor_name}</span></span>
        )}
      </div>

      {c.audience_names.length > 0 && (
        <div className="text-[9px] text-muted/70 mt-1 italic">{c.audience_names.join(", ")}</div>
      )}

      {/* Admin: issue badges. Tooltip (native `title`) gives the full
          explanation + fix hint so hovering reveals the detail without a
          bespoke tooltip component. Badges stack horizontally; multiple
          issues per card render side-by-side.
          Interaction details: the surrounding content layer is
          `pointer-events-none` so the click-anywhere-to-edit button
          works unimpeded. We re-enable pointer events on the badges
          themselves (so `title` tooltips fire on hover), and forward
          badge clicks back to onEditSlot — the admin's mental model
          stays "click a flagged card → edit it". */}
      {slotIssues.length > 0 && admin && (
        <div
          className="flex flex-wrap gap-1 mt-1.5 relative z-[2] pointer-events-auto"
          onClick={(e) => { e.stopPropagation(); admin.onEditSlot?.(c); }}
        >
          {slotIssues.map((code) => {
            const def = ISSUE_DEFS[code];
            const isError = def.severity === "error";
            return (
              <span
                key={code}
                title={def.tooltip}
                className={`inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded border cursor-help ${
                  isError
                    ? "bg-danger-light text-danger border-danger/40"
                    : "bg-yellow-light text-ink border-yellow"
                }`}
              >
                <span aria-hidden="true">{isError ? "✕" : "⚠"}</span>
                {def.label}
              </span>
            );
          })}
        </div>
      )}

      {c.link_label && c.link_url && !adminMode && (
        <div className="absolute bottom-1.5 right-1.5">
          <LinkBadge label={c.link_label} url={c.link_url} />
        </div>
      )}

      {adminMode && inactive && (
        <div className="absolute bottom-1.5 right-1.5">
          <span className="text-[9px] font-bold tracking-wider uppercase bg-disabled-light text-muted px-1.5 py-0.5 rounded">
            Inactive
          </span>
        </div>
      )}
    </>
  );

  // Public render — plain div. Keeps the tree shallow for everyone who
  // isn't running the admin surface.
  if (!adminMode) {
    return (
      <div className={cardClasses} style={{ borderLeftColor: cfg.borderHex }}>
        {content}
      </div>
    );
  }

  // Admin render — the card itself has a full-bleed click layer (the
  // card surface = edit target), a non-interactive content layer on
  // top of it, and a hover overflow menu anchored top-right. The menu
  // sits above the click layer; stopPropagation on menu clicks keeps
  // the card's edit from double-firing.
  return (
    <div className={cardClasses} style={{ borderLeftColor: cfg.borderHex }}>
      <button
        type="button"
        onClick={() => admin!.onEditSlot?.(c)}
        className="absolute inset-0 rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-mid/60 z-0"
        aria-label={`Edit ${c.title}`}
      />
      <div className="relative pointer-events-none z-[1]">
        {content}
      </div>
      <div className="absolute top-1 right-1 z-10">
        <AdminCardMenu
          slot={c}
          onEdit={admin!.onEditSlot}
          onToggleActive={admin!.onToggleActive}
          onDuplicate={admin!.onDuplicate}
          onDelete={admin!.onDelete}
        />
      </div>
    </div>
  );
}

// ── Concurrent group ────────────────────────────────────────────────────────
function ConcurrentGroup({
  group,
  stacked = false,
  admin,
}: {
  group: TimeSlotGroup;
  stacked?: boolean;
  admin?: AdminCardContext | null;
}) {
  const n = group.entries.length;
  const gridClass = stacked
    ? "space-y-2"
    : n === 1
    ? ""
    : n === 2
    ? "grid grid-cols-2 gap-2"
    : "grid grid-cols-3 gap-1.5";

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[10px] font-semibold text-muted/80 tracking-wider">
          {formatTime(group.time)}
        </span>
        {n > 1 && (
          <span className="text-[9px] font-bold tracking-wider uppercase text-muted/50">
            {n} mats
          </span>
        )}
      </div>
      <div className={stacked ? gridClass : gridClass}>
        {group.entries.map((c) => (
          <ClassBlock key={c.id} c={c} showTime={false} admin={admin} />
        ))}
      </div>
    </div>
  );
}

// ── Expandable overflow badge — Week Glance mode ───────────────────────────
function ExpandableGroup({
  group,
  expandKey,
  onToggle,
  admin,
}: {
  group: TimeSlotGroup;
  expandKey: string;
  onToggle: (key: string) => void;
  admin?: AdminCardContext | null;
}) {
  const overflow = group.entries.slice(1);
  return (
    <div className="space-y-1.5">
      <ClassBlock c={group.entries[0]} admin={admin} />
      <button
        onClick={() => onToggle(expandKey)}
        className="w-full text-left text-[10px] font-semibold text-muted/70 hover:text-ink bg-yellow-today hover:bg-yellow-light border border-dashed border-yellow-border hover:border-yellow rounded px-2.5 py-1.5 transition-colors duration-150 cursor-pointer"
      >
        +{overflow.length} más · {formatTime(group.time)}
      </button>
    </div>
  );
}

// ── Period separator ───────────────────────────────────────────────────────
function PeriodSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-3">
      <div className="flex-1 h-[1.5px] bg-line" />
      <span className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted/60 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-[1.5px] bg-line" />
    </div>
  );
}

function MiniPeriodLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1 py-1.5">
      <div className="flex-1 h-[1.5px] bg-line/60" />
      <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-muted/40 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-[1.5px] bg-line/60" />
    </div>
  );
}

// ── Week Glance column ─────────────────────────────────────────────────────
function WeekDayColumn({
  classes,
  showPeriodLabels,
  expandedGroups,
  onToggleGroup,
  dayKey,
  dayOfWeek,
  admin,
}: {
  classes: EnrichedScheduleSlot[];
  showPeriodLabels: boolean;
  expandedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  dayKey: string;
  /** 1=Mon..7=Sun — needed for the admin "Add slot" ghost so the modal
   *  opens pre-filled with the right day. */
  dayOfWeek: number;
  admin?: AdminCardContext | null;
}) {
  const slots = useMemo(() => groupByTimeSlot(classes), [classes]);

  function renderSlot(slot: TimeSlotGroup) {
    const key = `${dayKey}-${slot.time}`;
    if (slot.entries.length === 1) {
      return <ClassBlock key={key} c={slot.entries[0]} admin={admin} />;
    }
    if (expandedGroups.has(key)) {
      return (
        <div key={key}>
          <ConcurrentGroup group={slot} stacked admin={admin} />
          <button
            onClick={() => onToggleGroup(key)}
            className="w-full text-left text-[10px] font-semibold text-muted/60 hover:text-ink bg-yellow-today hover:bg-yellow-light border border-dashed border-yellow-border hover:border-yellow rounded px-2.5 py-1 mt-1 transition-colors duration-150 cursor-pointer"
          >
            <ChevronUp className="w-3 h-3 inline mr-1" />cerrar
          </button>
        </div>
      );
    }
    return <ExpandableGroup key={key} group={slot} expandKey={key} onToggle={onToggleGroup} admin={admin} />;
  }

  // Admin-only Add-slot ghost at the bottom of each column. Keeps the
  // public schedule visually identical (ghost only renders in admin
  // mode).
  const addGhost = admin?.onAddSlot ? (
    <AdminAddSlotGhost dayOfWeek={dayOfWeek} onAddSlot={admin.onAddSlot} />
  ) : null;

  if (!showPeriodLabels) {
    return (
      <div className="space-y-2">
        {slots.map(renderSlot)}
        {addGhost}
      </div>
    );
  }

  const items: React.ReactNode[] = [];
  PERIODS.forEach((period) => {
    const periodSlots = slots.filter((s) => getTimePeriod(s.time) === period);
    if (periodSlots.length === 0) return;
    items.push(<MiniPeriodLabel key={`sep-${period}`} label={PERIOD_LABEL[period]} />);
    periodSlots.forEach((slot) => items.push(renderSlot(slot)));
  });

  return (
    <div className="space-y-2">
      {items}
      {addGhost}
    </div>
  );
}

// ── Focus Day column ───────────────────────────────────────────────────────
function FocusDayColumn({
  classes,
  showPeriodLabels,
  dayOfWeek,
  admin,
}: {
  classes: EnrichedScheduleSlot[];
  showPeriodLabels: boolean;
  dayOfWeek: number;
  admin?: AdminCardContext | null;
}) {
  const slots = useMemo(() => groupByTimeSlot(classes), [classes]);
  const addGhost = admin?.onAddSlot ? (
    <AdminAddSlotGhost dayOfWeek={dayOfWeek} onAddSlot={admin.onAddSlot} />
  ) : null;

  if (!showPeriodLabels) {
    return (
      <div className="space-y-3">
        {slots.map((slot) => (
          <ConcurrentGroup key={slot.time} group={slot} admin={admin} />
        ))}
        {addGhost}
      </div>
    );
  }

  return (
    <>
      {PERIODS.map((period) => {
        const periodSlots = slots.filter((s) => getTimePeriod(s.time) === period);
        if (periodSlots.length === 0) return null;
        return (
          <div key={period}>
            <PeriodSeparator label={PERIOD_LABEL[period]} />
            <div className="space-y-3">
              {periodSlots.map((slot) => (
                <ConcurrentGroup key={slot.time} group={slot} admin={admin} />
              ))}
            </div>
          </div>
        );
      })}
      {addGhost}
    </>
  );
}

// ── Mobile: one day ────────────────────────────────────────────────────────
function MobileDayClasses({
  classes,
  showSeparators,
  dayOfWeek,
  admin,
}: {
  classes: EnrichedScheduleSlot[];
  showSeparators: boolean;
  dayOfWeek: number;
  admin?: AdminCardContext | null;
}) {
  const slots = useMemo(() => groupByTimeSlot(classes), [classes]);
  const addGhost = admin?.onAddSlot ? (
    <AdminAddSlotGhost dayOfWeek={dayOfWeek} onAddSlot={admin.onAddSlot} />
  ) : null;

  if (!showSeparators) {
    return (
      <div className="space-y-3">
        {slots.map((slot) => (
          <ConcurrentGroup key={slot.time} group={slot} stacked admin={admin} />
        ))}
        {addGhost}
      </div>
    );
  }

  return (
    <>
      {PERIODS.map((period) => {
        const periodSlots = slots.filter((s) => getTimePeriod(s.time) === period);
        if (periodSlots.length === 0) return null;
        return (
          <div key={period}>
            <PeriodSeparator label={PERIOD_LABEL[period]} />
            <div className="space-y-3">
              {periodSlots.map((slot) => (
                <ConcurrentGroup key={slot.time} group={slot} stacked admin={admin} />
              ))}
            </div>
          </div>
        );
      })}
      {addGhost}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Schedule({
  schedule,
  modalityOptions,
  sectionConfig,
  adminMode,
  highlightIssues = false,
  onEditSlot,
  onAddSlot,
  onToggleActive,
  onDuplicate,
  onDelete,
}: Props) {
  // Precompute the issue map once per (slots, highlightIssues) change.
  // Detectors are O(n) per slot for the cross-slot rules (duplicate,
  // area_conflict); doing this inside each ClassBlock would cascade to
  // O(n²) every render. The map stays empty when highlightIssues is
  // off so public callers pay no cost.
  const issuesBySlotId = useMemo(() => {
    if (!adminMode || !highlightIssues) return new Map<number, IssueCode[]>();
    return buildIssueMap(schedule);
  }, [adminMode, highlightIssues, schedule]);

  // Bundle admin callbacks + precomputed issues into a single context
  // object that threads through the nested column / group / block
  // renderers. `null` means public mode — cheaper to propagate than a
  // seven-prop spread.
  const admin: AdminCardContext | null = adminMode
    ? {
        highlightIssues,
        issuesBySlotId: highlightIssues ? issuesBySlotId : undefined,
        onEditSlot,
        onAddSlot,
        onToggleActive,
        onDuplicate,
        onDelete,
      }
    : null;
  const FILTERS = useMemo(() => buildFilters(modalityOptions), [modalityOptions]);
  const [filter, setFilter]           = useState<string>("all");
  const [timeFilter, setTimeFilter]   = useState<TimePeriod>("all");
  const [viewMode, setViewMode]       = useState<"week" | "focus">("week");
  const [today, setToday]             = useState<DayOfWeek | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>("Monday");
  const [focusStart, setFocusStart]   = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = getTodayName() as DayOfWeek;
    setToday(t);
    setSelectedDay(t);
  }, []);

  const tag   = sectionConfig?.display_subtitle ?? "Entrena con nosotros";
  const title = sectionConfig?.display_title    ?? "Horarios";

  const filtered = useMemo(() => {
    let result = [...schedule].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    if (filter !== "all") {
      result = result.filter((c) => matchesFilter(c, filter));
    }
    if (timeFilter !== "all") {
      result = result.filter((c) => getTimePeriod(c.start_time) === timeFilter);
    }
    return result;
  }, [schedule, filter, timeFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, EnrichedScheduleSlot[]>();
    DAYS_OF_WEEK.forEach((d) => map.set(d, []));
    filtered.forEach((c) => { map.get(dayName(c.day_of_week))?.push(c); });
    return map;
  }, [filtered]);

  // Admin mode always shows all seven columns (even empty days) so the
  // "Add slot" ghost is reachable from every day. Public mode still
  // hides days with zero classes — preserves the compact landing
  // layout when the gym runs a 6-day week.
  const daysWithClasses = useMemo(
    () =>
      adminMode
        ? [...DAYS_OF_WEEK]
        : DAYS_OF_WEEK.filter((d) => (byDay.get(d) ?? []).length > 0),
    [byDay, adminMode]
  );

  useEffect(() => {
    if (!today) return;
    const idx = daysWithClasses.indexOf(today);
    if (idx === -1) return;
    const snapped = Math.max(0, Math.min(idx - 1, daysWithClasses.length - 3));
    setFocusStart(snapped);
  }, [today, daysWithClasses]);

  const effectiveDay: DayOfWeek = daysWithClasses.includes(selectedDay)
    ? selectedDay
    : daysWithClasses[0] ?? "Monday";

  const showSeparators = timeFilter === "all";

  const FOCUS_WINDOW = 3;
  const focusDays = daysWithClasses.slice(focusStart, focusStart + FOCUS_WINDOW);
  const canPrev = focusStart > 0;
  const canNext = focusStart + FOCUS_WINDOW < daysWithClasses.length;

  const todayInFocusWindow = today !== null && focusDays.includes(today);
  const todayIndexInAll = today !== null ? daysWithClasses.indexOf(today) : -1;
  const todayFocusStart = todayIndexInAll >= 0
    ? Math.max(0, Math.min(todayIndexInAll - 1, daysWithClasses.length - FOCUS_WINDOW))
    : 0;

  const weekGridCols  = `repeat(${daysWithClasses.length}, minmax(0, 1fr))`;
  const focusGridCols = `repeat(${focusDays.length}, minmax(0, 1fr))`;

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section
      id="schedule"
      className={adminMode ? "" : "py-10 px-5 nav:px-12"}
    >
      {/* Public marketing header — hidden in admin mode (the admin page
          owns its own header + toolbar). */}
      {!adminMode && (
        <>
          <div className="inline-flex items-center gap-2 font-mono text-[13px] tracking-ultra uppercase text-blue-mid border-l-[3px] border-yellow pl-2.5 mb-4">
            {tag}
          </div>
          <h2 className="text-[clamp(40px,5.5vw,68px)] text-black leading-none mb-2">
            {title}
          </h2>
          <p className="text-[15px] text-muted mb-6 max-w-[560px] leading-relaxed">
            Gi, No-Gi, kids y open mats. Filtra por tipo de clase o por horario.{" "}
            <span className="text-ink font-medium">Consulta por clases privadas.</span>
          </p>
        </>
      )}

      {/* ── Mobile filters ── */}
      <div className="nav:hidden mb-5 space-y-2">
        <div className="flex overflow-x-auto scrollbar-hide gap-1.5 pb-0.5">
          {FILTERS.map(({ label, value, dot, dotHex }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-150 cursor-pointer ${
                filter === value
                  ? "bg-black text-white border-black"
                  : "bg-white text-muted border-line"
              }`}
            >
              {dot && (
                <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${filter === value ? "opacity-80" : ""} ${dot}`} />
              )}
              {!dot && dotHex && (
                <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${filter === value ? "opacity-80" : ""}`} style={{ backgroundColor: dotHex }} />
              )}
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {TIME_FILTERS.map(({ label, value, hint }) => (
            <button
              key={value}
              onClick={() => setTimeFilter(value)}
              className={`flex flex-col items-center justify-center py-2 rounded-lg border transition-all duration-150 cursor-pointer ${
                timeFilter === value
                  ? "bg-black text-white border-black"
                  : "bg-white text-muted border-line"
              }`}
            >
              <span className="text-[11px] font-semibold leading-none">{label}</span>
              {hint && (
                <span className={`text-[9px] mt-1 leading-none ${timeFilter === value ? "text-white/55" : "text-muted/50"}`}>
                  {hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop filters ── */}
      <div className="hidden nav:flex items-start gap-3 mb-8">
        <div className="flex flex-wrap gap-2 flex-1">
          {FILTERS.map(({ label, value, dot, dotHex }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 font-body cursor-pointer ${
                filter === value
                  ? "bg-black text-white border-black"
                  : "bg-white text-muted border-line hover:border-black hover:text-ink"
              }`}
            >
              {dot && (
                <span className={`w-3 h-3 rounded-sm flex-shrink-0 ${filter === value ? "opacity-80" : ""} ${dot}`} />
              )}
              {!dot && dotHex && (
                <span className={`w-3 h-3 rounded-sm flex-shrink-0 ${filter === value ? "opacity-80" : ""}`} style={{ backgroundColor: dotHex }} />
              )}
              {label}
            </button>
          ))}

          <div className="w-px bg-line mx-1 self-stretch" />

          {TIME_FILTERS.map(({ label, value, hint }) => (
            <button
              key={value}
              onClick={() => setTimeFilter(value)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 font-body cursor-pointer ${
                timeFilter === value
                  ? "bg-black text-white border-black"
                  : "bg-white text-muted border-line hover:border-black hover:text-ink"
              }`}
            >
              {label}
              {hint && (
                <span className={`text-[10px] font-normal ${timeFilter === value ? "text-white/60" : "text-muted/60"}`}>
                  {hint}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-shrink-0 border border-line rounded-full p-0.5">
          {(["week", "focus"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 cursor-pointer capitalize ${
                viewMode === mode
                  ? "bg-black text-white"
                  : "text-muted hover:text-ink"
              }`}
            >
              {mode === "week" ? "Semana" : "Detalle"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mobile: day-picker + single-day view ── */}
      <div className="nav:hidden">
        <div className="flex gap-1 mb-5">
          {daysWithClasses.map((day) => {
            const isSelected = day === effectiveDay;
            const isToday    = today !== null && day === today;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day as DayOfWeek)}
                className={`flex-1 relative py-2 text-[11px] font-semibold rounded transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "bg-black text-white"
                    : isToday
                    ? "bg-yellow-light text-black border border-yellow-border"
                    : "bg-white border border-line text-muted"
                }`}
              >
                {DAY_SHORT_ES[day as DayOfWeek]}
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-yellow block" />
                )}
              </button>
            );
          })}
        </div>

        <div className={`rounded p-3 ${
          today !== null && effectiveDay === today
            ? "bg-yellow-today border border-yellow-border"
            : "bg-off-white border border-line"
        }`}>
          <div className={`font-display text-[22px] text-black pb-2.5 border-b-2 mb-3 flex items-center justify-between ${
            today !== null && effectiveDay === today ? "border-b-yellow" : "border-b-line"
          }`}>
            {DAY_LABEL_ES[effectiveDay]}
            {today !== null && effectiveDay === today && (
              <span className="font-body text-[9px] font-bold tracking-[0.1em] uppercase bg-yellow text-black px-1.5 py-0.5 rounded-full">
                Hoy
              </span>
            )}
          </div>
          <MobileDayClasses
            classes={byDay.get(effectiveDay) ?? []}
            showSeparators={showSeparators}
            dayOfWeek={DAYS_OF_WEEK.indexOf(effectiveDay) + 1}
            admin={admin}
          />
        </div>
      </div>

      {/* ── Desktop ── */}
      <div className="hidden nav:block">

        {/* ── Week Glance ── */}
        {viewMode === "week" && (
          <>
            <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: weekGridCols }}>
              {daysWithClasses.map((day) => {
                const isToday = today !== null && day === today;
                return (
                  <div
                    key={day}
                    className={`font-display text-[18px] text-black pb-2 border-b-2 flex items-center justify-between ${
                      isToday ? "border-b-yellow" : "border-b-line"
                    }`}
                  >
                    {DAY_SHORT_ES[day as DayOfWeek]}
                    {isToday && (
                      <span className="font-body text-[9px] font-bold tracking-[0.1em] uppercase bg-yellow text-black px-1.5 py-0.5 rounded-full">
                        Hoy
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-2 items-start mt-2" style={{ gridTemplateColumns: weekGridCols }}>
              {daysWithClasses.map((day) => (
                <WeekDayColumn
                  key={day}
                  dayKey={day}
                  dayOfWeek={DAYS_OF_WEEK.indexOf(day as DayOfWeek) + 1}
                  classes={byDay.get(day) ?? []}
                  showPeriodLabels={showSeparators}
                  expandedGroups={expandedGroups}
                  onToggleGroup={toggleGroup}
                  admin={admin}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Focus: 3-day carousel ── */}
        {viewMode === "focus" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFocusStart((s) => Math.max(0, s - 1))}
                  disabled={!canPrev}
                  className="w-7 h-7 rounded-full border border-line flex items-center justify-center text-sm text-muted hover:text-ink hover:border-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Día anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setFocusStart((s) => Math.min(s + 1, daysWithClasses.length - FOCUS_WINDOW))}
                  disabled={!canNext}
                  className="w-7 h-7 rounded-full border border-line flex items-center justify-center text-sm text-muted hover:text-ink hover:border-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Día siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted font-mono ml-1">
                  {focusDays[0] ? DAY_SHORT_ES[focusDays[0] as DayOfWeek] : ""} – {focusDays[focusDays.length - 1] ? DAY_SHORT_ES[focusDays[focusDays.length - 1] as DayOfWeek] : ""}
                </span>
              </div>

              {today !== null && !todayInFocusWindow && (
                <button
                  onClick={() => setFocusStart(todayFocusStart)}
                  className="text-xs font-semibold text-orange hover:text-orange-mid bg-orange-light border border-orange-border rounded-full px-3 py-1 transition-colors cursor-pointer"
                >
                  Ir a hoy
                </button>
              )}
            </div>

            <div className="grid gap-3 mb-1" style={{ gridTemplateColumns: focusGridCols }}>
              {focusDays.map((day) => {
                const isToday = today !== null && day === today;
                return (
                  <div
                    key={day}
                    className={`font-display text-[20px] text-black pb-2 border-b-2 flex items-center justify-between ${
                      isToday ? "border-b-yellow" : "border-b-line"
                    }`}
                  >
                    {DAY_LABEL_ES[day as DayOfWeek]}
                    {isToday && (
                      <span className="font-body text-[9px] font-bold tracking-[0.1em] uppercase bg-yellow text-black px-1.5 py-0.5 rounded-full">
                        Hoy
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {showSeparators ? (
              PERIODS.map((period) => {
                const anyInPeriod = focusDays.some(
                  (day) => (byDay.get(day) ?? []).some((c) => getTimePeriod(c.start_time) === period)
                );
                if (!anyInPeriod) return null;
                return (
                  <div key={period}>
                    <PeriodSeparator label={PERIOD_LABEL[period]} />
                    <div className="grid gap-3 items-start" style={{ gridTemplateColumns: focusGridCols }}>
                      {focusDays.map((day) => {
                        const slots = groupByTimeSlot(
                          (byDay.get(day) ?? []).filter((c) => getTimePeriod(c.start_time) === period)
                        );
                        return (
                          <div key={day} className="space-y-3">
                            {slots.map((slot) => <ConcurrentGroup key={slot.time} group={slot} admin={admin} />)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="grid gap-3 items-start" style={{ gridTemplateColumns: focusGridCols }}>
                {focusDays.map((day) => (
                  <FocusDayColumn
                    key={day}
                    classes={byDay.get(day) ?? []}
                    showPeriodLabels={false}
                    dayOfWeek={DAYS_OF_WEEK.indexOf(day as DayOfWeek) + 1}
                    admin={admin}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
