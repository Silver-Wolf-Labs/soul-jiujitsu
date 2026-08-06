"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toggleSectionVisible, reorderSection, updateSectionTitles } from "@/lib/actions/sections";
import { ReorderButtons } from "@/components/ui/ReorderButtons";
import Spinner from "@/components/ui/Spinner";
import type { SiteSection } from "@/lib/supabase/types";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import ErrorToast from "@/components/admin/ErrorToast";

type EditingTitles = { title: string; subtitle: string } | null;

export default function AdminSectionsPage() {
  const [sections, setSections] = useState<SiteSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitles, setEditingTitles] = useState<EditingTitles>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("site_sections").select("*").order("display_order");
    setSections((data as SiteSection[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(id: number, visible: boolean) {
    await toggleSectionVisible(id, !visible);
    await load();
  }

  const { reorder, error: reorderError } = useOptimisticReorder(
    sections,
    setSections,
    "display_order",
    "id",
  );

  async function handleReorder(s: SiteSection, direction: "up" | "down") {
    await reorder(s, direction, () => reorderSection(s.id, direction, s.display_order));
  }

  function startEdit(s: SiteSection) {
    setEditingId(s.id);
    setEditingTitles({
      title: s.display_title ?? "",
      subtitle: s.display_subtitle ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingTitles(null);
  }

  async function handleSaveTitles(s: SiteSection) {
    if (!editingTitles) return;
    setSavingId(s.id);
    try {
      await updateSectionTitles(s.id, editingTitles.title, editingTitles.subtitle);
      setEditingId(null);
      setEditingTitles(null);
      await load();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl text-black mb-1">Sections</h1>
      <p className="text-sm text-muted mb-6">
        Reorder or hide homepage sections. Click <strong>Edit Titles</strong> to customize the heading and tag label displayed on the public site.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <div className="space-y-2">
          {sections.map((s, idx) => {
            const isEditing = editingId === s.id;
            return (
              <div
                key={s.id}
                className={`bg-white border border-line rounded-lg overflow-hidden ${!s.visible ? "opacity-60" : ""}`}
              >
                {/* Row */}
                <div className="px-4 sm:px-5 py-3.5 flex items-center gap-3">
                  <ReorderButtons
                    onUp={() => handleReorder(s, "up")}
                    onDown={() => handleReorder(s, "down")}
                    disableUp={idx === 0}
                    disableDown={idx === sections.length - 1}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink">{s.label}</span>
                      <span className="text-xs text-muted font-mono">{s.key}</span>
                    </div>
                    {(s.display_title || s.display_subtitle) && (
                      <div className="text-xs text-muted mt-0.5">
                        {s.display_subtitle && <span className="uppercase tracking-wider">{s.display_subtitle}</span>}
                        {s.display_subtitle && s.display_title && <span className="mx-1.5 opacity-40">·</span>}
                        {s.display_title && <span className="font-medium text-ink">{s.display_title}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(s)}
                        className="text-xs text-blue-mid hover:underline"
                      >
                        Edit Titles
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(s.id, s.visible)}
                      className={`text-xs px-3 py-1 rounded border transition-colors ${
                        s.visible
                          ? "border-success-border text-success hover:bg-success-light"
                          : "border-line text-muted hover:border-black"
                      }`}
                    >
                      {s.visible ? "Visible" : "Hidden"}
                    </button>
                  </div>
                </div>

                {/* Inline title editor */}
                {isEditing && editingTitles && (
                  <div className="border-t border-line px-4 sm:px-5 py-4 bg-off-white space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                          Main Title
                        </label>
                        <input
                          type="text"
                          value={editingTitles.title}
                          onChange={(e) => setEditingTitles({ ...editingTitles, title: e.target.value })}
                          placeholder="e.g. Class Schedule"
                          className="w-full border border-line rounded px-3 py-1.5 text-sm focus:outline-none focus:border-black bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                          Tag / Eyebrow
                        </label>
                        <input
                          type="text"
                          value={editingTitles.subtitle}
                          onChange={(e) => setEditingTitles({ ...editingTitles, subtitle: e.target.value })}
                          placeholder="e.g. When We Train"
                          className="w-full border border-line rounded px-3 py-1.5 text-sm focus:outline-none focus:border-black bg-white"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={cancelEdit} className="text-xs px-3 py-1.5 border border-line rounded hover:border-black transition-colors">
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveTitles(s)}
                        disabled={savingId === s.id}
                        className="text-xs px-3 py-1.5 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
                      >
                        {savingId === s.id ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ErrorToast message={reorderError} />
    </div>
  );
}
