"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import {
  createFAQItem, updateFAQItem, deleteFAQItem,
  toggleFAQItemActive, reorderFAQItem,
} from "@/lib/actions/faq";
import { ReorderButtons } from "@/components/ui/ReorderButtons";
import MarkdownToolbar from "@/components/admin/MarkdownToolbar";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import ErrorToast from "@/components/admin/ErrorToast";
import type { FAQItem } from "@/lib/supabase/types";

const emptyForm = {
  question: "",
  answer: "",
  display_order: 1,
  active: true,
  starts_at: "",
  expires_at: "",
};

export default function AdminFAQPage() {
  const [items, setItems] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<FAQItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("faq_items").select("*").order("display_order");
    setItems((data as FAQItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, display_order: items.length + 1 });
    setView("edit");
  }

  function openEdit(item: FAQItem) {
    setEditing(item);
    setForm({
      question: item.question,
      answer: item.answer,
      display_order: item.display_order,
      active: item.active,
      starts_at: item.starts_at ? item.starts_at.slice(0, 16) : "",
      expires_at: item.expires_at ? item.expires_at.slice(0, 16) : "",
    });
    setView("edit");
  }

  async function handleSave() {
    if (!form.question.trim() || !form.answer.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      if (editing) {
        await updateFAQItem(editing.id, payload);
      } else {
        await createFAQItem(payload);
      }
      await load();
      setView("list");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this FAQ item?")) return;
    await deleteFAQItem(id);
    await load();
  }

  async function handleToggle(id: number, active: boolean) {
    await toggleFAQItemActive(id, !active);
    await load();
  }

  const { reorder, error: reorderError } = useOptimisticReorder(items, setItems, "display_order", "id");

  async function handleReorder(item: FAQItem, direction: "up" | "down") {
    await reorder(item, direction, () => reorderFAQItem(item.id, direction, item.display_order));
  }

  const isExpired = (item: FAQItem) => !!item.expires_at && new Date(item.expires_at) < new Date();
  const isScheduled = (item: FAQItem) => !!item.starts_at && new Date(item.starts_at) > new Date();

  return (
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
        <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setView("list")} className="text-sm text-muted hover:text-black">
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
            </button>
            <h1 className="font-display text-2xl sm:text-3xl text-black">
              {editing ? "Edit Question" : "New Question"}
            </h1>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Question</label>
              <input type="text" value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder="e.g. What is Brazilian Jiu-Jitsu?"
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-muted uppercase tracking-wide">Answer</label>
                <MarkdownToolbar
                  textareaRef={answerRef}
                  onChange={(v) => setForm(f => ({ ...f, answer: v }))}
                />
              </div>
              <textarea
                ref={answerRef}
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                placeholder="Supports **bold**, *italic*, [links](url)…"
                rows={5}
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
              <span className="text-sm text-ink">Active (visible on site)</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-line">
            <button onClick={() => setView("list")} className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.question.trim() || !form.answer.trim()}
              className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Question"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl text-black">FAQ</h1>
              <p className="text-sm text-muted mt-0.5">{items.length} items</p>
            </div>
            <button
              onClick={openAdd}
              className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors"
            >
              + Add Question
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
          ) : (
            <div className="space-y-3">
              {items.map((item, idx) => {
                const expired = isExpired(item);
                return (
                  <div
                    key={item.id}
                    className={`bg-white border border-line rounded-lg px-4 sm:px-5 py-4 ${!item.active || expired ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <ReorderButtons
                        onUp={() => handleReorder(item, "up")}
                        onDown={() => handleReorder(item, "down")}
                        disableUp={idx === 0}
                        disableDown={idx === items.length - 1}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {!item.active && !expired && <span className="text-xs bg-disabled-light text-muted px-2 py-0.5 rounded">Inactive</span>}
                          {expired && <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded border border-danger-border">Expired</span>}
                          {item.active && !expired && isScheduled(item) && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-200">Scheduled</span>}
                          {item.expires_at && !expired && <span className="text-xs text-muted">Expires {item.expires_at.slice(0, 10)}</span>}
                        </div>
                        <p className="text-sm font-semibold text-ink">{item.question}</p>
                        <p className="text-xs text-muted line-clamp-2 mt-0.5">{item.answer}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                      <button
                        onClick={() => handleToggle(item.id, item.active)}
                        className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                          item.active && !expired
                            ? "border-success-border text-success hover:bg-success-light"
                            : "border-line text-muted hover:border-black"
                        }`}
                      >
                        {item.active ? (expired ? "Re-activate" : "Active") : "Inactive"}
                      </button>
                      <button onClick={() => openEdit(item)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors">Edit</button>
                      <button onClick={() => handleDelete(item.id)} className="text-xs px-3 py-1.5 rounded border border-line text-danger hover:border-black transition-colors">Delete</button>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <p className="text-sm text-muted text-center py-12">No FAQ items yet.</p>}
            </div>
          )}

          <ErrorToast message={reorderError} />
        </div>
      )}
    </AdminViewTransition>
  );
}
