"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createBanner, updateBanner, deleteBanner, toggleBannerActive, reorderBanner } from "@/lib/actions/banners";
import { useToast } from "@/hooks/useToast";
import { saveSetting } from "@/lib/actions/settings-extra";
import { InlineMd } from "@/components/ui/InlineMd";
import Spinner from "@/components/ui/Spinner";
import { ReorderButtons } from "@/components/ui/ReorderButtons";
import MarkdownToolbar from "@/components/admin/MarkdownToolbar";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import ErrorToast from "@/components/admin/ErrorToast";
import type { Banner } from "@/lib/supabase/types";

const MAX_BANNERS = 3;
const INTERVALS = [3, 5, 10] as const;

const COLORS: { value: string; label: string; bg: string; text: string }[] = [
  { value: "black",  label: "Dark",    bg: "bg-black",  text: "text-white" },
  { value: "blue",   label: "Info",    bg: "bg-blue",   text: "text-white" },
  { value: "purple", label: "Accent",  bg: "bg-purple", text: "text-white" },
  { value: "brown",  label: "Warm",    bg: "bg-brown",  text: "text-white" },
  { value: "yellow", label: "Primary", bg: "bg-yellow", text: "text-black" },
];

const emptyForm = {
  text: "",
  color: "black",
  display_order: 1,
  active: true,
  starts_at: "",
  expires_at: "",
  section: "top",
  expanded: false,
};

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [interval, setIntervalVal] = useState(5);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [intervalSaving, setIntervalSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const { message: toastMessage, showError, dismiss: dismissToast } = useToast();

  async function load() {
    const supabase = createClient();
    const [{ data: bData }, { data: sData }] = await Promise.all([
      supabase.from("banners").select("*").order("display_order"),
      supabase.from("site_settings").select("key,value").eq("key", "banner_interval"),
    ]);
    setBanners((bData as Banner[]) ?? []);
    setIntervalVal(parseInt(sData?.[0]?.value ?? "5", 10));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const sectionBanners = banners.filter((b) => b.section === "top");

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, section: "top", display_order: sectionBanners.length + 1 });
    setView("edit");
  }

  function openEdit(b: Banner) {
    setEditing(b);
    setForm({
      text: b.text,
      color: b.color,
      display_order: b.display_order,
      active: b.active,
      starts_at: b.starts_at ? b.starts_at.slice(0, 16) : "",
      expires_at: b.expires_at ? b.expires_at.slice(0, 16) : "",
      section: b.section,
      expanded: b.expanded ?? false,
    });
    setView("edit");
  }

  async function handleSave() {
    if (!form.text.trim()) return;
    const editingRef = editing;
    const payload = {
      ...form,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      expanded: form.expanded,
    };

    if (editingRef) {
      // Optimistic update
      const optimistic: Banner = { ...editingRef, ...payload };
      setBanners((prev) => prev.map((b) => b.id === editingRef.id ? optimistic : b));
      setView("list");
      try {
        await updateBanner(editingRef.id, payload);
      } catch {
        setBanners((prev) => prev.map((b) => b.id === editingRef.id ? editingRef : b));
        showError("Failed to save changes. Please try again.");
      }
    } else {
      // Optimistic create — navigate first, sync in background
      setSaving(true);
      setView("list");
      setSaving(false);
      try {
        await createBanner(payload);
        load(); // background refresh
      } catch {
        showError("Failed to add banner. Please try again.");
      }
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this banner?")) return;
    const snapshot = banners;
    setBanners((prev) => prev.filter((b) => b.id !== id));
    try {
      await deleteBanner(id);
    } catch {
      setBanners(snapshot);
      showError("Failed to delete banner. Please try again.");
    }
  }

  async function handleToggle(id: number, active: boolean) {
    setBanners((prev) => prev.map((b) => b.id === id ? { ...b, active: !active } : b));
    try {
      await toggleBannerActive(id, !active);
    } catch {
      setBanners((prev) => prev.map((b) => b.id === id ? { ...b, active } : b));
      showError("Failed to update status. Please try again.");
    }
  }

  const { reorder, error: reorderError } = useOptimisticReorder(banners, setBanners, "display_order", "id");

  async function handleReorder(b: Banner, direction: "up" | "down") {
    await reorder(b, direction, () => reorderBanner(b.id, direction, b.display_order, b.section));
  }

  async function handleIntervalSave(val: number) {
    setIntervalSaving(true);
    setIntervalVal(val);
    await saveSetting("banner_interval", String(val));
    setIntervalSaving(false);
  }

  const isExpired = (b: Banner) => !!b.expires_at && new Date(b.expires_at) < new Date();
  const isScheduled = (b: Banner) => !!b.starts_at && new Date(b.starts_at) > new Date();

  return (
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
        <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setView("list")} className="text-sm text-muted hover:text-black">
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
            </button>
            <h1 className="font-display text-2xl sm:text-3xl text-black">
              {editing ? "Edit Banner" : "New Banner"}
            </h1>
          </div>
          <div className="space-y-4">
            {/* Color picker */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setForm({ ...form, color: c.value })}
                    className={`flex-1 py-2 rounded text-xs font-semibold ${c.bg} ${c.text} border-2 transition-all ${
                      form.color === c.value ? "border-yellow scale-105" : "border-transparent"
                    }`}
                    style={form.color === c.value && c.value === "yellow" ? { borderColor: "var(--color-ink)" } : {}}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Text with markdown toolbar */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Text</label>
              <MarkdownToolbar textareaRef={textRef} onChange={(v) => setForm(f => ({...f, text: v}))} />
              <textarea
                ref={textRef}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value.slice(0, 150) })}
                placeholder="e.g. **New class** added — Tuesdays 7PM!"
                rows={2}
                maxLength={150}
                className="mt-1 w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black resize-none font-mono"
              />
              <div className={`text-right text-xs mt-0.5 ${form.text.length >= 140 ? "text-danger" : "text-muted"}`}>
                {form.text.length}/150
              </div>
              {form.text && (
                <div className={`mt-2 px-3 py-2 rounded text-sm ${COLORS.find(c => c.value === form.color)?.bg} ${COLORS.find(c => c.value === form.color)?.text}`}>
                  <InlineMd text={form.text} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Display Order</label>
                <input type="number" value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 1 })}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
              <div className="flex items-end pb-2 flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
                  <span className="text-sm text-ink">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.expanded} onChange={(e) => setForm({ ...form, expanded: e.target.checked })} className="rounded" />
                  <span className="text-sm text-ink">Expanded</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  Start Date <span className="font-normal normal-case text-muted">(optional — defaults to now)</span>
                </label>
                <input type="datetime-local" value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  End Date <span className="font-normal normal-case text-muted">(optional — hides after)</span>
                </label>
                <input type="datetime-local" value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-line">
            <button onClick={() => setView("list")} className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.text.trim()}
              className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Banner"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
          <h1 className="font-display text-3xl sm:text-4xl text-black mb-1">Banners</h1>
          <p className="text-sm text-muted mb-6">Rotating alert banners shown at the top of the site.</p>

          {/* Interval setting */}
          <div className="bg-white border border-line rounded-lg px-4 sm:px-5 py-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-ink">Rotation Speed</p>
              <p className="text-xs text-muted">How long each banner shows before cycling</p>
            </div>
            <div className="flex gap-2">
              {INTERVALS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleIntervalSave(s)}
                  disabled={intervalSaving}
                  className={`text-sm px-3 py-1.5 rounded border font-medium transition-colors ${
                    interval === s
                      ? "bg-black text-white border-black"
                      : "bg-white text-ink border-line hover:border-black"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          {/* Banner list */}
          {loading ? (
            <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
          ) : (
            <div className="space-y-2 mb-6">
              {sectionBanners.map((b, idx) => {
                const colorCfg = COLORS.find((c) => c.value === b.color) ?? COLORS[0];
                const expired = isExpired(b);
                return (
                  <div key={b.id} className={`border border-line rounded-lg overflow-hidden ${!b.active || expired ? "opacity-60" : ""}`}>
                    {/* Preview bar */}
                    <div className={`${colorCfg.bg} ${colorCfg.text} px-3 py-2 text-sm flex items-center gap-2`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${b.color === "yellow" ? "bg-black" : "bg-yellow"}`} />
                      <span className="flex-1"><InlineMd text={b.text} /></span>
                      {expired && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">Expired</span>}
                      {!b.active && !expired && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">Inactive</span>}
                      {b.active && !expired && isScheduled(b) && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">Scheduled</span>}
                    </div>
                    {/* Controls — single row */}
                    <div className="bg-white px-3 py-2 flex items-center gap-3">
                      <ReorderButtons
                        onUp={() => handleReorder(b, "up")}
                        onDown={() => handleReorder(b, "down")}
                        disableUp={idx === 0}
                        disableDown={idx === sectionBanners.length - 1}
                      />
                      <div className="flex items-center gap-2 text-xs text-muted flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${colorCfg.bg}`} />
                          {colorCfg.label}
                        </span>
                        {b.expires_at && <span>Exp {b.expires_at.slice(0, 10)}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggle(b.id, b.active)}
                          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                            b.active && !expired
                              ? "border-success-border text-success"
                              : "border-line text-muted hover:border-black"
                          }`}
                        >
                          {b.active ? (expired ? "Re-activate" : "Active") : "Inactive"}
                        </button>
                        <button onClick={() => openEdit(b)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors">Edit</button>
                        <button onClick={() => handleDelete(b.id)} className="text-xs px-3 py-1.5 rounded border border-line text-danger hover:border-black transition-colors">Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {sectionBanners.length === 0 && (
                <p className="text-sm text-muted text-center py-8">No banners yet.</p>
              )}
            </div>
          )}

          {sectionBanners.length < MAX_BANNERS ? (
            <button
              onClick={openAdd}
              className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors"
            >
              + Add Banner
            </button>
          ) : (
            <p className="text-xs text-muted">Maximum of {MAX_BANNERS} banners reached.</p>
          )}

          <ErrorToast message={reorderError} />
          <ErrorToast message={toastMessage} onDismiss={dismissToast} />
        </div>
      )}
    </AdminViewTransition>
  );
}
