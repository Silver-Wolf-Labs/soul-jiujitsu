"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/hooks/useToast";
import {
  createUpdate,
  updateUpdate,
  deleteUpdate,
  toggleUpdatePublished,
  reorderUpdate,
} from "@/lib/actions/updates";
import { UpdateType, UPDATE_TAG_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { ReorderButtons } from "@/components/ui/ReorderButtons";
import MarkdownToolbar from "@/components/admin/MarkdownToolbar";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import ErrorToast from "@/components/admin/ErrorToast";
import type { Update } from "@/lib/supabase/types";

const emptyForm = {
  type: UpdateType.News,
  title: "",
  body: "",
  date: new Date().toISOString().split("T")[0],
  published: true,
  starts_at: "",
  expires_at: "",
  display_order: 1,
};

export default function AdminUpdatesPage() {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<Update | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { message: toastMessage, showError, dismiss: dismissToast } = useToast();

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("updates")
      .select("*")
      .order("display_order", { ascending: true })
      .order("date", { ascending: false });
    setUpdates((data as Update[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, display_order: updates.length + 1 });
    setView("edit");
  }

  function openEdit(u: Update) {
    setEditing(u);
    setForm({
      type: u.type,
      title: u.title,
      body: u.body,
      date: u.date,
      published: u.published,
      starts_at: u.starts_at ? u.starts_at.slice(0, 16) : "",
      expires_at: u.expires_at ? u.expires_at.slice(0, 16) : "",
      display_order: u.display_order,
    });
    setView("edit");
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    const editingRef = editing;
    const payload = {
      ...form,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };

    if (editingRef) {
      // Optimistic update
      const optimistic: Update = { ...editingRef, ...payload };
      setUpdates((prev) => prev.map((u) => u.id === editingRef.id ? optimistic : u));
      setView("list");
      try {
        await updateUpdate(editingRef.id, payload);
      } catch {
        setUpdates((prev) => prev.map((u) => u.id === editingRef.id ? editingRef : u));
        showError("Failed to save changes. Please try again.");
      }
    } else {
      // Optimistic create — navigate first, sync in background
      setSaving(true);
      setView("list");
      setSaving(false);
      try {
        await createUpdate(payload);
        load(); // background refresh
      } catch {
        showError("Failed to create update. Please try again.");
      }
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this update?")) return;
    const snapshot = updates;
    setUpdates((prev) => prev.filter((u) => u.id !== id));
    try {
      await deleteUpdate(id);
    } catch {
      setUpdates(snapshot);
      showError("Failed to delete update. Please try again.");
    }
  }

  async function handleToggle(id: number, published: boolean) {
    setUpdates((prev) => prev.map((u) => u.id === id ? { ...u, published: !published } : u));
    try {
      await toggleUpdatePublished(id, !published);
    } catch {
      setUpdates((prev) => prev.map((u) => u.id === id ? { ...u, published } : u));
      showError("Failed to update status. Please try again.");
    }
  }

  const { reorder, error: reorderError } = useOptimisticReorder(updates, setUpdates, "display_order", "id");

  async function handleReorder(u: Update, direction: "up" | "down") {
    await reorder(u, direction, () => reorderUpdate(u.id, direction, u.display_order));
  }

  const isExpired = (u: Update) =>
    !!u.expires_at && new Date(u.expires_at) < new Date();
  const isScheduled = (u: Update) =>
    !!u.starts_at && new Date(u.starts_at) > new Date();

  return (
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
        <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setView("list")} className="text-sm text-muted hover:text-black">
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
            </button>
            <h1 className="font-display text-2xl sm:text-3xl text-black">
              {editing ? "Edit Update" : "New Update"}
            </h1>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as UpdateType })}
                  className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black">
                  {Object.values(UpdateType).map((t) => (
                    <option key={t} value={t}>{UPDATE_TAG_CONFIG[t].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Update headline"
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
            <div>
              <div className="flex flex-col gap-2 mb-2">
                <label className="text-xs font-semibold text-muted uppercase tracking-wide">Body</label>
                <MarkdownToolbar
                  textareaRef={bodyRef}
                  onChange={(v) => setForm(f => ({ ...f, body: v }))}
                />
              </div>
              <textarea
                ref={bodyRef}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Supports **bold**, *italic*, ~~strikethrough~~, [link](url)"
                rows={4}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black resize-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Display Order</label>
              <input type="number" value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 1 })}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  Start Date <span className="font-normal normal-case text-muted">(optional)</span>
                </label>
                <input type="datetime-local" value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  End Date <span className="font-normal normal-case text-muted">(optional)</span>
                </label>
                <input type="datetime-local" value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="rounded" />
              <span className="text-sm text-ink">Published (visible to visitors)</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-line">
            <button onClick={() => setView("list")} className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Update"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl text-black">Updates</h1>
              <p className="text-sm text-muted mt-0.5">{updates.length} total</p>
            </div>
            <button
              onClick={openAdd}
              className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors"
            >
              + New Update
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
          ) : (
            <div className="space-y-3">
              {updates.map((u, idx) => {
                const tag = UPDATE_TAG_CONFIG[u.type];
                const expired = isExpired(u);
                return (
                  <div
                    key={u.id}
                    className={`bg-white border border-line rounded-lg px-4 sm:px-5 py-4 ${expired || !u.published ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <ReorderButtons
                        onUp={() => handleReorder(u, "up")}
                        onDown={() => handleReorder(u, "down")}
                        disableUp={idx === 0}
                        disableDown={idx === updates.length - 1}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${tag.className}`}>{tag.label}</span>
                          <span className="text-xs text-muted">{formatDate(u.date)}</span>
                          {!u.published && <span className="text-xs bg-disabled-light text-muted px-2 py-0.5 rounded">Draft</span>}
                          {expired && <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded border border-danger-border">Expired</span>}
                          {u.published && !expired && isScheduled(u) && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-200">Scheduled</span>}
                          {u.expires_at && !expired && (
                            <span className="text-xs text-muted hidden sm:inline">Expires {formatDate(u.expires_at)}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-ink truncate">{u.title}</p>
                        <p className="text-xs text-muted line-clamp-1 mt-0.5">{u.body}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                      <button
                        onClick={() => handleToggle(u.id, u.published)}
                        className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                          u.published && !expired
                            ? "border-success-border text-success hover:bg-success-light"
                            : "border-line text-muted hover:border-black"
                        }`}
                      >
                        {u.published ? (expired ? "Re-publish" : "Published") : "Publish"}
                      </button>
                      <button onClick={() => openEdit(u)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors">Edit</button>
                      <button onClick={() => handleDelete(u.id)} className="text-xs px-3 py-1.5 rounded border border-line text-danger hover:border-danger transition-colors ml-auto">Delete</button>
                    </div>
                  </div>
                );
              })}
              {updates.length === 0 && (
                <p className="text-muted text-sm text-center py-12">No updates yet.</p>
              )}
            </div>
          )}

          <ErrorToast message={reorderError} />
          <ErrorToast message={toastMessage} onDismiss={dismissToast} />
        </div>
      )}
    </AdminViewTransition>
  );
}
