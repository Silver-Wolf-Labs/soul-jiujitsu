"use client";

/**
 * `/admin/classes` — manage the four class taxonomy dimensions
 * (modality / level / focus / audience) from a single flat-tab surface
 * per LLD §4.2.
 *
 * Each tab renders `<TaxonomyManager>` with a dimension-specific server
 * action wiring + per-dimension form extras. Audience tab additionally
 * shows a chip filter row (All / Age / Gender / Rank / Access) above the
 * list, driven by the `?kind=` URL param.
 *
 * The bottom of the Modalities tab surfaces `schedule_slots_needs_review`
 * — slots that backfill couldn't map to a modality. Empty on a clean
 * seed; the affordance exists for when seed drift happens.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TaxonomyManager, { type TaxonomyRow } from "@/components/admin/TaxonomyManager";
import {
  listModalities,
  createModality,
  updateModality,
  deactivateModality,
  reactivateModality,
  reorderModality,
  getModalityUsage,
  listLevels,
  createLevel,
  updateLevel,
  deactivateLevel,
  reactivateLevel,
  reorderLevel,
  getLevelUsage,
  deleteLevel,
  listFocuses,
  createFocus,
  updateFocus,
  deactivateFocus,
  reactivateFocus,
  reorderFocus,
  getFocusUsage,
  deleteFocus,
  listAudiences,
  createAudience,
  updateAudience,
  deactivateAudience,
  reactivateAudience,
  reorderAudience,
  getAudienceUsage,
  deleteAudience,
} from "@/lib/actions/class-taxonomy";
import type {
  ClassModality,
  ClassLevel,
  ClassFocus,
  ClassAudience,
  AudienceKind,
} from "@/lib/supabase/types";

type TabKey = "modalities" | "levels" | "focuses" | "audiences";

const TABS: { key: TabKey; label: string }[] = [
  { key: "modalities", label: "Modalities" },
  { key: "levels",     label: "Levels" },
  { key: "focuses",    label: "Focuses" },
  { key: "audiences",  label: "Audiences" },
];

const AUDIENCE_KIND_FILTERS: { value: "all" | AudienceKind; label: string }[] = [
  { value: "all",    label: "All" },
  { value: "age",    label: "Age" },
  { value: "gender", label: "Gender" },
  { value: "rank",   label: "Rank" },
  { value: "access", label: "Access" },
];

export default function AdminClassesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = (searchParams.get("tab") as TabKey | null) ?? "modalities";
  const kindParam = (searchParams.get("kind") as "all" | AudienceKind | null) ?? "all";
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? tabParam : "modalities";

  function selectTab(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (tab !== "audiences") params.delete("kind");
    router.replace(`/admin/classes?${params.toString()}`);
  }

  function selectAudienceKind(kind: "all" | AudienceKind) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "audiences");
    if (kind === "all") params.delete("kind");
    else params.set("kind", kind);
    router.replace(`/admin/classes?${params.toString()}`);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl text-black">Classes</h1>
        <p className="text-sm text-muted mt-0.5">
          Manage the dimensions that describe every class — modality, level, focus, audience.
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-line mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? "border-black text-black"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "modalities" && <ModalityPane />}
      {activeTab === "levels"     && <LevelPane />}
      {activeTab === "focuses"    && <FocusPane />}
      {activeTab === "audiences"  && (
        <AudiencePane kindFilter={kindParam} onKindChange={selectAudienceKind} />
      )}
    </div>
  );
}

// ── Modality pane ───────────────────────────────────────────────────────

type ModalityForm = {
  name: string;
  slug: string;
  color: string;
  sort_order: number;
};

function ModalityPane() {
  const [rows, setRows] = useState<ClassModality[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const m = await listModalities({ includeInactive: true });
    setRows(m);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <TaxonomyManager<ClassModality, ModalityForm>
        singular="Modality"
        plural="Modalities"
        rows={rows}
        loading={loading}
        buildEmptyForm={(nextOrder) => ({ name: "", slug: "", color: "", sort_order: nextOrder })}
        buildFormFromRow={(row) => ({
          name: row.name,
          slug: row.slug,
          color: row.color ?? "",
          sort_order: row.sort_order,
        })}
        renderFormFields={(form, setForm) => (
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
              Color <span className="font-normal normal-case text-muted">(optional hex)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color || "#3E63DD"}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-10 h-10 border border-line rounded cursor-pointer"
                aria-label="Modality color"
              />
              <input
                type="text"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="#3E63DD"
                className="flex-1 border border-line rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-black"
              />
              {form.color && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, color: "" })}
                  className="text-xs text-muted hover:text-black"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
        renderRowMeta={(row) => row.color ? (
          <span
            className="w-3.5 h-3.5 rounded-full border border-line"
            style={{ backgroundColor: row.color }}
            title={row.color}
          />
        ) : null}
        onCreate={async (form) => {
          await createModality({
            name: form.name,
            slug: form.slug || undefined,
            color: form.color || null,
            sort_order: form.sort_order,
          });
        }}
        onUpdate={async (id, form) => {
          await updateModality(id, {
            name: form.name,
            slug: form.slug || undefined,
            color: form.color || null,
            sort_order: form.sort_order,
          });
        }}
        onDeactivate={deactivateModality}
        onReactivate={reactivateModality}
        onReorder={reorderModality}
        onGetUsage={getModalityUsage}
        refresh={load}
      />
    </div>
  );
}

// ── Level / Focus panes (identical shape, flat label dimensions) ───────

type FlatForm = { name: string; slug: string; sort_order: number };

function LevelPane() {
  const [rows, setRows] = useState<ClassLevel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await listLevels({ includeInactive: true }));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <TaxonomyManager<ClassLevel, FlatForm>
      singular="Level"
      plural="Levels"
      rows={rows}
      loading={loading}
      buildEmptyForm={(n) => ({ name: "", slug: "", sort_order: n })}
      buildFormFromRow={(r) => ({ name: r.name, slug: r.slug, sort_order: r.sort_order })}
      renderFormFields={() => null}
      onCreate={async (f) => { await createLevel({ name: f.name, slug: f.slug || undefined, sort_order: f.sort_order }); }}
      onUpdate={async (id, f) => { await updateLevel(id, { name: f.name, slug: f.slug || undefined, sort_order: f.sort_order }); }}
      onDeactivate={deactivateLevel}
      onReactivate={reactivateLevel}
      onReorder={reorderLevel}
      onGetUsage={getLevelUsage}
      onDelete={deleteLevel}
      refresh={load}
    />
  );
}

function FocusPane() {
  const [rows, setRows] = useState<ClassFocus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await listFocuses({ includeInactive: true }));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <TaxonomyManager<ClassFocus, FlatForm>
      singular="Focus"
      plural="Focuses"
      rows={rows}
      loading={loading}
      buildEmptyForm={(n) => ({ name: "", slug: "", sort_order: n })}
      buildFormFromRow={(r) => ({ name: r.name, slug: r.slug, sort_order: r.sort_order })}
      renderFormFields={() => null}
      onCreate={async (f) => { await createFocus({ name: f.name, slug: f.slug || undefined, sort_order: f.sort_order }); }}
      onUpdate={async (id, f) => { await updateFocus(id, { name: f.name, slug: f.slug || undefined, sort_order: f.sort_order }); }}
      onDeactivate={deactivateFocus}
      onReactivate={reactivateFocus}
      onReorder={reorderFocus}
      onGetUsage={getFocusUsage}
      onDelete={deleteFocus}
      refresh={load}
    />
  );
}

// ── Audience pane (typed by kind + in-panel chip filter) ───────────────

type AudienceForm = {
  name: string;
  slug: string;
  kind: AudienceKind;
  min_age: string; // text inputs — parsed on save
  max_age: string;
  gender: "" | "female" | "male";
  sort_order: number;
};

// Mirror the DB CHECK behavior in the UI: when kind changes, wipe
// metadata that no longer applies so the form can't submit nonsense.
function normalizeAudienceForm(prev: AudienceForm): AudienceForm {
  if (prev.kind === "age")     return { ...prev, gender: "" };
  if (prev.kind === "gender")  return { ...prev, min_age: "", max_age: "" };
  return { ...prev, min_age: "", max_age: "", gender: "" };
}

// Extend TaxonomyRow just so the manager can group-badge by kind.
interface AudienceRow extends ClassAudience, TaxonomyRow {}

function AudiencePane({
  kindFilter,
  onKindChange,
}: {
  kindFilter: "all" | AudienceKind;
  onKindChange: (kind: "all" | AudienceKind) => void;
}) {
  const [rows, setRows] = useState<AudienceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await listAudiences({ includeInactive: true });
    setRows(all as AudienceRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = kindFilter === "all" ? rows : rows.filter((r) => r.kind === kindFilter);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {AUDIENCE_KIND_FILTERS.map((opt) => {
          const count = opt.value === "all"
            ? rows.length
            : rows.filter((r) => r.kind === opt.value).length;
          const active = kindFilter === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onKindChange(opt.value)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-black text-white border-black"
                  : "bg-white text-muted border-line hover:border-muted hover:text-ink"
              }`}
            >
              {opt.label}
              <span className={active ? "opacity-70" : "opacity-50"}>{count}</span>
            </button>
          );
        })}
      </div>

      <TaxonomyManager<AudienceRow, AudienceForm>
        singular="Audience"
        plural="Audiences"
        rows={filtered}
        loading={loading}
        buildEmptyForm={(n) => ({
          name: "",
          slug: "",
          kind: kindFilter === "all" ? "age" : (kindFilter as AudienceKind),
          min_age: "",
          max_age: "",
          gender: "",
          sort_order: n,
        })}
        buildFormFromRow={(r) => ({
          name: r.name,
          slug: r.slug,
          kind: r.kind,
          min_age: r.min_age != null ? String(r.min_age) : "",
          max_age: r.max_age != null ? String(r.max_age) : "",
          gender: (r.gender ?? "") as AudienceForm["gender"],
          sort_order: r.sort_order,
        })}
        renderFormFields={(form, setForm) => (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Kind</label>
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm(normalizeAudienceForm({ ...form, kind: e.target.value as AudienceKind }))
                }
                className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black"
              >
                <option value="age">Age (enforced: min / max)</option>
                <option value="gender">Gender (enforced: female / male)</option>
                <option value="rank">Rank (advisory label only)</option>
                <option value="access">Access (advisory label only)</option>
              </select>
            </div>

            {form.kind === "age" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Min age</label>
                  <input
                    type="number"
                    min={0}
                    value={form.min_age}
                    onChange={(e) => setForm({ ...form, min_age: e.target.value })}
                    className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Max age</label>
                  <input
                    type="number"
                    min={0}
                    value={form.max_age}
                    onChange={(e) => setForm({ ...form, max_age: e.target.value })}
                    className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
                  />
                </div>
                <p className="col-span-2 text-xs text-muted">
                  Provide at least one bound. Leave the other blank for open-ended ranges
                  (e.g. Age 40+ sets min=40, max blank).
                </p>
              </div>
            )}

            {form.kind === "gender" && (
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) =>
                    setForm({ ...form, gender: e.target.value as AudienceForm["gender"] })
                  }
                  className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black"
                >
                  <option value="">— select —</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
            )}

            {(form.kind === "rank" || form.kind === "access") && (
              <p className="text-xs text-muted italic">
                This kind carries no enforcement metadata. The audience name is the advisory
                label shown at kiosk check-in.
              </p>
            )}
          </div>
        )}
        renderRowMeta={(row) => (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-off-white border border-line text-muted">
              {row.kind}
            </span>
            {row.kind === "age" && (row.min_age != null || row.max_age != null) && (
              <span className="text-xs text-muted">
                {row.min_age ?? "—"}–{row.max_age ?? "—"}
              </span>
            )}
            {row.kind === "gender" && row.gender && (
              <span className="text-xs text-muted">{row.gender}</span>
            )}
          </>
        )}
        onCreate={async (f) => {
          await createAudience({
            name: f.name,
            slug: f.slug || undefined,
            kind: f.kind,
            min_age: f.min_age ? parseInt(f.min_age, 10) : null,
            max_age: f.max_age ? parseInt(f.max_age, 10) : null,
            gender: f.gender || null,
            sort_order: f.sort_order,
          });
        }}
        onUpdate={async (id, f) => {
          await updateAudience(id, {
            name: f.name,
            slug: f.slug || undefined,
            kind: f.kind,
            min_age: f.min_age ? parseInt(f.min_age, 10) : null,
            max_age: f.max_age ? parseInt(f.max_age, 10) : null,
            gender: f.gender || null,
            sort_order: f.sort_order,
          });
        }}
        onDeactivate={deactivateAudience}
        onReactivate={reactivateAudience}
        onReorder={reorderAudience}
        onGetUsage={getAudienceUsage}
        onDelete={deleteAudience}
        refresh={load}
      />
    </div>
  );
}
