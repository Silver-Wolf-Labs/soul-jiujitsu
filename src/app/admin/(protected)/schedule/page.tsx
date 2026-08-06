"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import {
  createScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry,
  toggleScheduleEntry,
} from "@/lib/actions/schedule";
import {
  listModalities,
  listLevels,
  listFocuses,
  listAudiences,
  createModality,
  createLevel,
  createFocus,
  createAudience,
} from "@/lib/actions/class-taxonomy";
import { DAYS_OF_WEEK } from "@/lib/constants";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import ErrorToast from "@/components/admin/ErrorToast";
import InstructorCombobox, { type SelectedInstructor } from "@/components/admin/InstructorCombobox";
import ClassTaxonomyPicker from "@/components/admin/ClassTaxonomyPicker";
import Schedule, { type EnrichedScheduleSlot } from "@/components/landing/Schedule";
import {
  buildIssueMap,
  summarizeIssues,
  ISSUE_DEFS,
  type IssueCode,
} from "@/components/landing/schedule-issues";

/** Small helper retained for the edit-form subtitle only; grid view
 *  pulls its own day labels from DAYS_OF_WEEK internally. */
function dayLabel(dow: number): string {
  return DAYS_OF_WEEK[dow - 1] ?? String(dow);
}
import { useToast } from "@/hooks/useToast";
import type {
  ScheduleSlot,
  ClassModality,
  ClassLevel,
  ClassFocus,
  ClassAudience,
  AudienceKind,
} from "@/lib/supabase/types";
import type { InstructorOption } from "@/lib/actions/instructors";

const emptyForm = {
  day_of_week:     1,
  start_time:      "09:00",
  end_time:        "10:00",
  title:           "",
  area:            "",
  /** Primary-first list. Empty → no instructor assigned. */
  instructors:     [] as SelectedInstructor[],
  show_instructor: false,
  instructor_name_display: "full" as "full" | "first_only" | "last_only",
  link_label:      "",
  link_url:        "",
  active:          true,
  // ── Taxonomy (WS3) ────────────────────────────────────────────────────
  modality_id:     null as number | null,
  level_id:        null as number | null,
  focus_ids:       [] as number[],
  audience_ids:    [] as number[],
};

type FormState = typeof emptyForm;

// ── Shared field label ─────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold tracking-[0.1em] uppercase text-muted mb-1">
      {children}
    </label>
  );
}

const inputCls = "w-full border border-line rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-black transition-colors";

// ── Section heading ────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[9px] font-black tracking-[0.15em] uppercase text-muted/50">{children}</span>
      <div className="flex-1 h-px bg-line" />
    </div>
  );
}

export default function AdminSchedulePage() {
  const [entries, setEntries]     = useState<ScheduleSlot[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<"list" | "edit">("list");
  const [editing, setEditing]     = useState<ScheduleSlot | null>(null);
  const [form, setForm]           = useState<FormState>(emptyForm);
  const [saving, setSaving]       = useState(false);
  // Admin-only UI state. "Highlight issues" dims cards that look
  // underconfigured (no instructor, except Open Mat). Persisted to URL
  // only implicitly; admins rarely bookmark this page.
  const [highlightIssues, setHighlightIssues] = useState(false);
  /** Full active+inactive instructor roster — source for the combobox. */
  const [instructorOptions, setInstructorOptions] = useState<InstructorOption[]>([]);
  /** Map of schedule_slot_id → primary-first instructor list. Populated on
   *  load so `openEdit` can pre-fill the combobox without another round-trip. */
  const [slotInstructorsMap, setSlotInstructorsMap] = useState<Map<number, SelectedInstructor[]>>(new Map());
  // ── Taxonomy option lists — loaded from server actions (includeInactive
  //    so an edit-mode form for a slot still resolves a deactivated row). ──
  const [modalities, setModalities] = useState<ClassModality[]>([]);
  const [levels,     setLevels]     = useState<ClassLevel[]>([]);
  const [focuses,    setFocuses]    = useState<ClassFocus[]>([]);
  const [audiences,  setAudiences]  = useState<ClassAudience[]>([]);
  // Junction maps for edit-mode pre-fill.
  const [slotFocusMap, setSlotFocusMap]       = useState<Map<number, number[]>>(new Map());
  const [slotAudienceMap, setSlotAudienceMap] = useState<Map<number, number[]>>(new Map());

  /** Title auto-fill gate — we apply the generated title whenever the user
   *  hasn't manually edited it (i.e. the current title is empty OR exactly
   *  matches the last auto-generated value). Backspacing to empty re-arms
   *  the generator; typing any custom title disarms it. */
  const [lastAutoTitle, setLastAutoTitle] = useState<string>("");

  const { message: toastMessage, showError, dismiss: dismissToast } = useToast();

  async function load() {
    try {
      const supabase = createClient();

      const [
        slotsRes,
        junctionRes,
        instructorsRes,
        focusJxRes,
        audienceJxRes,
        modalitiesRows,
        levelsRows,
        focusesRows,
        audiencesRows,
      ] = await Promise.all([
        supabase.from("schedule_slots").select("*").order("day_of_week").order("start_time"),
        supabase
          .from("schedule_slot_instructors")
          .select("schedule_slot_id, instructor_id, sort_order, instructors!inner(id, name, slug, active, team_member_id)")
          .order("sort_order", { ascending: true }),
        supabase.from("instructors").select("id, name, slug, active, team_member_id").order("name"),
        supabase.from("schedule_slot_focuses").select("schedule_slot_id, focus_id, sort_order").order("sort_order"),
        supabase.from("schedule_slot_audiences").select("schedule_slot_id, audience_id"),
        listModalities({ includeInactive: true }),
        listLevels({ includeInactive: true }),
        listFocuses({ includeInactive: true }),
        listAudiences({ includeInactive: true }),
      ]);

      if (slotsRes.error)      console.error("schedule_slots error:", slotsRes.error);
      if (junctionRes.error)   console.error("schedule_slot_instructors error:", junctionRes.error);
      if (instructorsRes.error) console.error("instructors error:", instructorsRes.error);
      if (focusJxRes.error)    console.error("schedule_slot_focuses error:", focusJxRes.error);
      if (audienceJxRes.error) console.error("schedule_slot_audiences error:", audienceJxRes.error);

      setEntries((slotsRes.data as ScheduleSlot[]) ?? []);
      setInstructorOptions((instructorsRes.data as InstructorOption[]) ?? []);
      setModalities(modalitiesRows);
      setLevels(levelsRows);
      setFocuses(focusesRows);
      setAudiences(audiencesRows);

      // Instructor map.
      const iMap = new Map<number, SelectedInstructor[]>();
      for (const row of (junctionRes.data ?? []) as unknown as {
        schedule_slot_id: number;
        instructor_id: number;
        sort_order: number;
        instructors: { id: number; name: string } | { id: number; name: string }[] | null;
      }[]) {
        const inst = Array.isArray(row.instructors) ? row.instructors[0] : row.instructors;
        if (!inst) continue;
        const list = iMap.get(row.schedule_slot_id) ?? [];
        list.push({ instructor_id: inst.id, name: inst.name });
        iMap.set(row.schedule_slot_id, list);
      }
      setSlotInstructorsMap(iMap);

      // Focus map (ordered by sort_order thanks to the query).
      const fMap = new Map<number, number[]>();
      for (const row of (focusJxRes.data ?? []) as { schedule_slot_id: number; focus_id: number }[]) {
        const list = fMap.get(row.schedule_slot_id) ?? [];
        list.push(row.focus_id);
        fMap.set(row.schedule_slot_id, list);
      }
      setSlotFocusMap(fMap);

      // Audience map.
      const aMap = new Map<number, number[]>();
      for (const row of (audienceJxRes.data ?? []) as { schedule_slot_id: number; audience_id: number }[]) {
        const list = aMap.get(row.schedule_slot_id) ?? [];
        list.push(row.audience_id);
        aMap.set(row.schedule_slot_id, list);
      }
      setSlotAudienceMap(aMap);
    } catch (e) {
      console.error("schedule load threw:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd(prefill?: Partial<FormState>) {
    setEditing(null);
    setForm({ ...emptyForm, ...(prefill ?? {}) });
    setLastAutoTitle("");
    setView("edit");
  }

  /**
   * Duplicate an existing slot: same as opening Add with the source's
   * fields pre-filled. The copy stays on the same day/time so admins
   * can tweak from there (move to a different day in the form, etc.).
   */
  function handleDuplicate(src: EnrichedScheduleSlot) {
    const fromJunction = slotInstructorsMap.get(src.id);
    const instructors: SelectedInstructor[] = fromJunction?.length
      ? fromJunction
      : src.instructor_name
        ? [{ name: src.instructor_name, instructor_id: src.instructor_id ?? null }]
        : [];
    openAdd({
      day_of_week:     src.day_of_week,
      start_time:      src.start_time.slice(0, 5),
      end_time:        src.end_time.slice(0, 5),
      title:           src.title,
      area:            src.area ?? "",
      instructors,
      show_instructor: src.show_instructor,
      instructor_name_display: src.instructor_name_display ?? "full",
      link_label:      src.link_label ?? "",
      link_url:        src.link_url ?? "",
      active:          true,
      modality_id:     src.modality_id,
      level_id:        src.level_id,
      focus_ids:       slotFocusMap.get(src.id) ?? [],
      audience_ids:    slotAudienceMap.get(src.id) ?? [],
    });
  }

  function openEdit(entry: ScheduleSlot) {
    setEditing(entry);
    // Instructor pre-fill — same pattern as before: junction first, scalar
    // fallback for slots that predate the junction population.
    const fromJunction = slotInstructorsMap.get(entry.id);
    const instructors: SelectedInstructor[] = fromJunction?.length
      ? fromJunction
      : entry.instructor_name
        ? [{ name: entry.instructor_name, instructor_id: entry.instructor_id ?? null }]
        : [];

    setForm({
      day_of_week:     entry.day_of_week,
      start_time:      entry.start_time.slice(0, 5),
      end_time:        entry.end_time.slice(0, 5),
      title:           entry.title,
      area:            entry.area ?? "",
      instructors,
      show_instructor: entry.show_instructor,
      instructor_name_display: entry.instructor_name_display ?? "full",
      link_label:      entry.link_label ?? "",
      link_url:        entry.link_url ?? "",
      active:          entry.active,
      modality_id:     entry.modality_id,
      level_id:        entry.level_id,
      focus_ids:       slotFocusMap.get(entry.id) ?? [],
      audience_ids:    slotAudienceMap.get(entry.id) ?? [],
    });
    // Treat the current title as user-authored on open so auto-title won't
    // stomp it. First edit to a dimension won't overwrite; clearing the
    // title re-arms the generator naturally.
    setLastAutoTitle("");
    setView("edit");
  }

  function f(key: keyof FormState, val: unknown) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  /** Wire-up for the picker's auto-title emit. Apply only when the user
   *  hasn't manually edited the title (empty OR exactly matches the last
   *  auto-generated value we applied). */
  function handleAutoTitle(next: string) {
    setForm((prev) => {
      const t = prev.title.trim();
      const allow = t === "" || t === lastAutoTitle;
      if (!allow) return prev;
      return { ...prev, title: next };
    });
    setLastAutoTitle(next);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    if (form.modality_id == null) {
      showError("Modality is required.");
      return;
    }
    const editingRef = editing;
    const payload = {
      day_of_week:     form.day_of_week,
      start_time:      form.start_time,
      end_time:        form.end_time,
      title:           form.title.trim(),
      modality_id:     form.modality_id,
      level_id:        form.level_id,
      focus_ids:       form.focus_ids,
      audience_ids:    form.audience_ids,
      area:            form.area.trim() || null,
      instructors:     form.instructors.map(si => ({
        instructor_id: si.instructor_id ?? undefined,
        name:          si.name.trim() || undefined,
      })).filter(x => x.instructor_id || x.name),
      show_instructor: form.show_instructor && form.instructors.length > 0,
      instructor_name_display: form.instructor_name_display,
      link_label:      form.link_label.trim() || null,
      link_url:        form.link_url.trim() || null,
      active:          form.active,
    };

    if (editingRef) {
      // Optimistic list patch. Rollback on server error.
      const optimistic = { ...editingRef, ...payload } as unknown as ScheduleSlot;
      setEntries((prev) => prev.map((e) => e.id === editingRef.id ? optimistic : e));
      setView("list");
      try {
        await updateScheduleEntry(editingRef.id, payload);
        // Refresh junction maps for the edited slot so the next open
        // pre-fills correctly.
        load();
      } catch {
        setEntries((prev) => prev.map((e) => e.id === editingRef.id ? editingRef : e));
        showError("Failed to save changes. Please try again.");
      }
    } else {
      setSaving(true);
      setView("list");
      setSaving(false);
      try {
        await createScheduleEntry(payload);
        load();
      } catch {
        showError("Failed to create slot. Please try again.");
      }
    }
  }

  async function handleToggleActive(id: number, active: boolean) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, active: !active } : e));
    try {
      await toggleScheduleEntry(id, !active);
    } catch {
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, active } : e));
      showError("Failed to update status. Please try again.");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this slot?")) return;
    const snapshot = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await deleteScheduleEntry(id);
    } catch {
      setEntries(snapshot);
      showError("Failed to delete slot. Please try again.");
    }
  }

  /**
   * Enrich the admin's `ScheduleSlot[]` with the modality / level /
   * audience snapshots `<Schedule>` needs. Uses the lookup tables
   * already loaded for the modal so we avoid an extra round-trip.
   * Level / modality / audience renames flow through because the map
   * lookups read the fresh in-memory rows on every re-render.
   */
  const enriched: EnrichedScheduleSlot[] = useMemo(() => {
    return entries.map((e) => {
      const modality = e.modality_id != null
        ? modalities.find((m) => m.id === e.modality_id) ?? null
        : null;
      const level = e.level_id != null
        ? levels.find((l) => l.id === e.level_id) ?? null
        : null;
      const audienceNames = (slotAudienceMap.get(e.id) ?? [])
        .map((id) => audiences.find((a) => a.id === id)?.name)
        .filter((n): n is string => !!n);
      return {
        ...e,
        modality_slug: modality?.slug ?? null,
        modality_name: modality?.name ?? null,
        modality_color: modality?.color ?? null,
        level_name: level?.name ?? null,
        audience_names: audienceNames,
      };
    });
  }, [entries, modalities, levels, audiences, slotAudienceMap]);

  const activeModalities = useMemo(
    () => modalities.filter((m) => m.active),
    [modalities],
  );

  /**
   * Issue summary for the chip above the grid. We recompute the map
   * here too (rather than routing it out of `<Schedule>`) because the
   * summary cares about the grand totals, not the per-slot list —
   * decoupling means the schedule component doesn't need to expose
   * render-time state upward. The detector is pure so running it
   * twice is a few ms on a 50-slot fixture.
   */
  const issueSummary = useMemo(() => {
    if (!highlightIssues) return null;
    return summarizeIssues(buildIssueMap(enriched));
  }, [highlightIssues, enriched]);

  // ── Inline-create wiring for the picker. Each wraps the corresponding
  //    server action, merges the returned row into our options lists, and
  //    returns it so the picker can auto-select it. ──
  async function handleCreateModality(name: string): Promise<ClassModality> {
    const row = await createModality({ name });
    setModalities(prev => [...prev, row]);
    return row;
  }
  async function handleCreateLevel(name: string): Promise<ClassLevel> {
    const row = await createLevel({ name });
    setLevels(prev => [...prev, row]);
    return row;
  }
  async function handleCreateFocus(name: string): Promise<ClassFocus> {
    const row = await createFocus({ name });
    setFocuses(prev => [...prev, row]);
    return row;
  }
  async function handleCreateAudience(data: {
    name: string;
    kind: AudienceKind;
    min_age?: number | null;
    max_age?: number | null;
    gender?: "female" | "male" | null;
  }): Promise<ClassAudience> {
    const row = await createAudience(data);
    setAudiences(prev => [...prev, row]);
    return row;
  }

  function modalityNameFor(slot: ScheduleSlot): string | null {
    if (slot.modality_id == null) return null;
    return modalities.find(m => m.id === slot.modality_id)?.name ?? null;
  }

  return (
    <>
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="text-sm text-muted hover:text-black">
            <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
          </button>
          <h1 className="font-display text-2xl sm:text-3xl text-black">
            {editing ? "Edit Slot" : "Add Slot"}
          </h1>
        </div>
        {editing && (
          <p className="text-xs text-muted mb-4">{editing.title} · {dayLabel(editing.day_of_week)}</p>
        )}

        <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">

          {/* Left column: When + Taxonomy */}
          <div className="space-y-6">

            {/* WHEN */}
            <div>
              <SectionHeading>When</SectionHeading>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Day</FieldLabel>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS_OF_WEEK.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => f("day_of_week", i + 1)}
                        className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-all cursor-pointer ${
                          form.day_of_week === i + 1
                            ? "bg-black text-white border-black"
                            : "bg-white text-ink border-line hover:border-black"
                        }`}
                      >
                        {d.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Start Time</FieldLabel>
                    <input type="time" value={form.start_time} onChange={(e) => f("start_time", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <FieldLabel>End Time</FieldLabel>
                    <input type="time" value={form.end_time} onChange={(e) => f("end_time", e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
            </div>

            {/* TAXONOMY */}
            <div>
              <SectionHeading>Class Taxonomy</SectionHeading>
              <ClassTaxonomyPicker
                modalityId={form.modality_id}
                levelId={form.level_id}
                focusIds={form.focus_ids}
                audienceIds={form.audience_ids}
                onChange={(next) => {
                  setForm(prev => ({
                    ...prev,
                    modality_id:  next.modality_id,
                    level_id:     next.level_id,
                    focus_ids:    next.focus_ids,
                    audience_ids: next.audience_ids,
                  }));
                }}
                modalityOptions={modalities}
                levelOptions={levels}
                focusOptions={focuses}
                audienceOptions={audiences}
                onAutoTitle={handleAutoTitle}
                onCreateModality={handleCreateModality}
                onCreateLevel={handleCreateLevel}
                onCreateFocus={handleCreateFocus}
                onCreateAudience={handleCreateAudience}
              />
            </div>

            {/* TITLE + AREA */}
            <div>
              <SectionHeading>Info</SectionHeading>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Title</FieldLabel>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => f("title", e.target.value)}
                    placeholder="Auto-generated from taxonomy — type to override"
                    className={inputCls}
                    autoFocus
                  />
                  <p className="text-[10px] text-muted/60 mt-1">
                    Clear the field to re-enable auto-generation from the taxonomy above.
                  </p>
                </div>
                <div>
                  <FieldLabel>Area / Room</FieldLabel>
                  <input
                    type="text"
                    value={form.area}
                    onChange={(e) => f("area", e.target.value)}
                    placeholder="Mat 1"
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right column: Instructors + Link */}
          <div className="space-y-6">

            {/* INSTRUCTOR — multi-select combobox with inline stub creation */}
            <div>
              <SectionHeading>Instructors</SectionHeading>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Who&apos;s teaching?</FieldLabel>
                  <InstructorCombobox
                    value={form.instructors}
                    onChange={(next) => f("instructors", next)}
                    options={instructorOptions}
                    max={3}
                    placeholder="Search or add an instructor…"
                  />
                </div>

                <div className={`space-y-3 ${form.instructors.length === 0 ? "opacity-40 pointer-events-none" : ""}`}>
                  <label className="flex items-center gap-2 cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={form.show_instructor}
                      onChange={(e) => f("show_instructor", e.target.checked)}
                      disabled={form.instructors.length === 0}
                      className="rounded"
                    />
                    <span className="text-sm text-ink">Show instructor name(s) on the public schedule</span>
                  </label>

                  {form.show_instructor && (
                    <div className="pl-6">
                      <FieldLabel>How to display</FieldLabel>
                      <div
                        role="radiogroup"
                        aria-label="Instructor name display format"
                        className="inline-flex border border-line rounded-md bg-white overflow-hidden text-xs"
                      >
                        {([
                          { value: "full", label: "Full" },
                          { value: "first_only", label: "First only" },
                          { value: "last_only", label: "Last only" },
                        ] as const).map(opt => {
                          const active = form.instructor_name_display === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => f("instructor_name_display", opt.value)}
                              className={`px-3 py-1.5 transition-colors ${
                                active ? "bg-black text-white" : "text-muted hover:text-ink hover:bg-paper"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* LINK PILL */}
            <div>
              <SectionHeading>Link Pill</SectionHeading>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Label</FieldLabel>
                  <input
                    type="text"
                    value={form.link_label}
                    onChange={(e) => f("link_label", e.target.value)}
                    placeholder="Sign Up, Register, Learn More…"
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>URL</FieldLabel>
                  <input
                    type="text"
                    value={form.link_url}
                    onChange={(e) => f("link_url", e.target.value)}
                    placeholder="https://… or /page"
                    className={inputCls}
                  />
                </div>
                {(form.link_label.trim() || form.link_url.trim()) && !(form.link_label.trim() && form.link_url.trim()) && (
                  <p className="text-[11px] text-yellow-dark">Both label and URL are required for the pill to appear.</p>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-6 pt-4 border-t border-line">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => f("active", e.target.checked)}
              className="rounded"
            />
            <span className="text-sm font-medium text-ink">Active</span>
            <span className="text-xs text-muted">(visible on schedule)</span>
          </label>
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              onClick={() => setView("list")}
              className="text-sm px-4 py-2 border border-line rounded-md hover:border-black transition-colors flex-1 sm:flex-none"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim() || form.modality_id == null}
              className="text-sm px-5 py-2 bg-black text-white rounded-md hover:bg-near-black disabled:opacity-50 transition-colors font-semibold flex-1 sm:flex-none"
              title={form.modality_id == null ? "Modality is required" : undefined}
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Slot"}
            </button>
          </div>
        </div>
      </div>
      ) : (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-3xl sm:text-4xl text-black">Schedule</h1>
          <p className="text-sm text-muted mt-0.5">
            {entries.length} slots · click any class to edit · hover for more
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* "Highlight issues" toggle — cards missing an instructor (and
              not an Open Mat) get a yellow ring so owners can find
              configuration gaps at a glance. */}
          <button
            type="button"
            onClick={() => setHighlightIssues(v => !v)}
            className={`text-xs font-semibold px-3 py-2 rounded border transition-colors ${
              highlightIssues
                ? "bg-yellow-light text-ink border-yellow"
                : "bg-white text-muted border-line hover:border-black hover:text-ink"
            }`}
            aria-pressed={highlightIssues}
          >
            {highlightIssues ? "◉" : "◎"} Highlight issues
          </button>
          <button
            onClick={() => openAdd()}
            className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors whitespace-nowrap"
          >
            + Add Slot
          </button>
        </div>
      </div>

      {/* Summary chip — renders only when the Highlight issues toggle
          is on. Gives a digest of flagged slots so the admin sees the
          total at a glance and decides where to look. A collapsible
          legend below explains each issue kind + how to resolve it. */}
      {issueSummary && (
        <IssueSummaryChip summary={issueSummary} />
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <div className="bg-white border border-line rounded-lg p-3 sm:p-5">
          <Schedule
            schedule={enriched}
            modalityOptions={activeModalities}
            adminMode
            highlightIssues={highlightIssues}
            onEditSlot={(slot) => openEdit(slot)}
            onAddSlot={(dayOfWeek) => openAdd({ day_of_week: dayOfWeek })}
            onToggleActive={handleToggleActive}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
          />
        </div>
      )}

    </div>
      )}
    </AdminViewTransition>
    <ErrorToast message={toastMessage} onDismiss={dismissToast} />
    </>
  );
}

/**
 * Digest row that renders above the grid when the Highlight issues
 * toggle is on. Shows the grand total + a per-code breakdown so the
 * admin can tell at a glance whether it's "5 copy-paste duplicates"
 * or "5 missing instructors" — the fixes are very different.
 *
 * A `<details>` legend below lists every issue kind with its tooltip
 * copy, so admins who don't recognize a badge can look up the
 * explanation without hovering every card. Collapsed by default to
 * keep the header compact.
 */
function IssueSummaryChip({
  summary,
}: {
  summary: { total: number; byCode: Record<IssueCode, number> };
}) {
  if (summary.total === 0) {
    return (
      <div className="mb-4 px-3 py-2 rounded-md border border-success-border bg-success-light text-xs text-success inline-flex items-center gap-2">
        <span aria-hidden="true">✓</span>
        No issues detected across the schedule.
      </div>
    );
  }

  const codes = (Object.keys(summary.byCode) as IssueCode[]).filter(
    (code) => summary.byCode[code] > 0,
  );

  return (
    <details className="mb-4 group" open>
      <summary className="list-none cursor-pointer inline-flex items-center gap-2 flex-wrap px-3 py-2 rounded-md border border-yellow bg-yellow-light text-xs text-ink">
        <span aria-hidden="true" className="font-bold">⚠</span>
        <span className="font-semibold">
          {summary.total} issue{summary.total === 1 ? "" : "s"} found
        </span>
        <span className="text-muted">·</span>
        <span className="text-muted/90">
          {codes
            .map((c) => `${summary.byCode[c]} ${ISSUE_DEFS[c].label.toLowerCase()}`)
            .join(" · ")}
        </span>
        <span className="ml-1 text-[10px] text-muted group-open:hidden">show key</span>
        <span className="ml-1 text-[10px] text-muted hidden group-open:inline">hide key</span>
      </summary>
      <div className="mt-2 p-3 rounded-md border border-line bg-white text-xs">
        <ul className="space-y-2">
          {(Object.keys(ISSUE_DEFS) as IssueCode[]).map((code) => {
            const def = ISSUE_DEFS[code];
            const isError = def.severity === "error";
            return (
              <li key={code} className="flex items-start gap-2">
                <span
                  className={`inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                    isError
                      ? "bg-danger-light text-danger border-danger/40"
                      : "bg-yellow-light text-ink border-yellow"
                  }`}
                >
                  <span aria-hidden="true">{isError ? "✕" : "⚠"}</span>
                  {def.label}
                </span>
                <span className="text-muted leading-snug">{def.tooltip}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
