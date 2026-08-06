"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import {
  createWaiverTemplate,
  updateWaiverTemplate,
  activateWaiverTemplate,
} from "@/lib/actions/waivers";
import MarkdownToolbar from "@/components/admin/MarkdownToolbar";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import type { WaiverTemplate } from "@/lib/supabase/types";

const emptyForm = { title: "", body_md: "" };

export default function AdminWaiversPage() {
  const [templates, setTemplates] = useState<WaiverTemplate[]>([]);
  const [sigCounts, setSigCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<WaiverTemplate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("waiver_templates")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data as WaiverTemplate[]) ?? [];
    setTemplates(rows);

    // Fetch signature counts for each template
    const counts: Record<number, number> = {};
    await Promise.all(
      rows.map(async (t) => {
        const { count } = await supabase
          .from("waiver_signatures")
          .select("id", { count: "exact", head: true })
          .eq("template_id", t.id);
        counts[t.id] = count ?? 0;
      })
    );
    setSigCounts(counts);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setView("edit");
  }

  function openEdit(t: WaiverTemplate) {
    setEditing(t);
    setForm({ title: t.title, body_md: t.body_md });
    setView("edit");
  }

  async function handleSave() {
    if (!form.title.trim() || !form.body_md.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateWaiverTemplate(editing.id, form);
      } else {
        await createWaiverTemplate(form);
      }
      await load();
      setView("list");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: number) {
    setActivating(id);
    try {
      await activateWaiverTemplate(id);
      await load();
    } finally {
      setActivating(null);
    }
  }

  const editingHasSignatures = editing ? (sigCounts[editing.id] ?? 0) > 0 : false;

  return (
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="text-sm text-muted hover:text-black">
            <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
          </button>
          <h1 className="font-display text-2xl sm:text-3xl text-black">
            {editing ? "Edit Template" : "New Template"}
          </h1>
        </div>

        <div className="space-y-4">
          {editingHasSignatures && (
            <div className="bg-yellow-light border border-yellow-border rounded px-4 py-3 text-sm text-yellow-dark">
              <strong>Note:</strong> This template has {sigCounts[editing!.id]} signature{sigCounts[editing!.id] !== 1 ? "s" : ""}. Saving will create a new version instead of modifying the existing one.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Liability Waiver & Membership Agreement"
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
              Body (Markdown)
            </label>
            <MarkdownToolbar
              textareaRef={bodyRef}
              onChange={(v) => setForm({ ...form, body_md: v })}
            />
            <textarea
              ref={bodyRef}
              value={form.body_md}
              onChange={(e) => setForm({ ...form, body_md: e.target.value })}
              placeholder="Write the waiver content in Markdown..."
              rows={18}
              className="w-full border border-line rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-black resize-y mt-2"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-line">
          <button
            onClick={() => setView("list")}
            className="flex-1 sm:flex-none text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim() || !form.body_md.trim()}
            className="flex-1 sm:flex-none text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : editing ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
      ) : (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-black">Waivers</h1>
          <p className="text-sm text-muted mt-1">Manage liability waiver templates for member sign-up.</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors whitespace-nowrap"
        >
          + New Template
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted text-center py-12">No waiver templates yet.</p>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="bg-white border border-line rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-ink truncate">{t.title}</div>
                    <div className="text-xs text-muted mt-0.5">v{t.version}</div>
                  </div>
                  {t.active ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success bg-success-light border border-success-border px-2 py-0.5 rounded-full shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted bg-off-white border border-line px-2 py-0.5 rounded-full shrink-0">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
                  <div>
                    <span className="text-muted text-xs">Signatures</span>
                    <div className="text-muted">{sigCounts[t.id] ?? 0}</div>
                  </div>
                  <div>
                    <span className="text-muted text-xs">Created</span>
                    <div className="text-muted text-xs">{t.created_at.slice(0, 10)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                  {!t.active && (
                    <button
                      onClick={() => handleActivate(t.id)}
                      disabled={activating === t.id}
                      className="text-xs px-3 py-1.5 rounded border border-line hover:border-black transition-colors disabled:opacity-50"
                    >
                      {activating === t.id ? "Activating..." : "Activate"}
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(t)}
                    className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block bg-white border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-off-white">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Version</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Signatures</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {templates.map((t, idx) => (
                  <tr key={t.id} className={`border-b border-line last:border-0 ${idx % 2 === 0 ? "" : "bg-off-white/30"}`}>
                    <td className="px-4 py-3 text-ink font-medium max-w-xs truncate">{t.title}</td>
                    <td className="px-4 py-3 text-muted">v{t.version}</td>
                    <td className="px-4 py-3">
                      {t.active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success bg-success-light border border-success-border px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-success" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted bg-off-white border border-line px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{sigCounts[t.id] ?? 0}</td>
                    <td className="px-4 py-3 text-muted text-xs">{t.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {!t.active && (
                          <button
                            onClick={() => handleActivate(t.id)}
                            disabled={activating === t.id}
                            className="text-xs px-2.5 py-1 border border-line rounded hover:border-black transition-colors disabled:opacity-50"
                          >
                            {activating === t.id ? "Activating..." : "Activate"}
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(t)}
                          className="text-xs text-blue-mid hover:underline"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
      )}
    </AdminViewTransition>
  );
}
