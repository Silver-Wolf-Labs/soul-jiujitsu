"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronUp, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/hooks/useToast";
import {
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  reorderTeamMember,
  toggleTeamActive,
} from "@/lib/actions/team";
import { BeltColor, TeamMemberType, BELT_COLOR_MAP, TEAM_TYPE_CONFIG } from "@/lib/constants";
import { getInitials } from "@/lib/utils";
import type { TeamMember } from "@/lib/supabase/types";
import AssetBrowser from "@/components/admin/AssetBrowser";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import ErrorToast from "@/components/admin/ErrorToast";

const emptyForm = {
  name: "",
  role: "",
  belt: BeltColor.White,
  bio: "",
  photo_url: "",
  slug: "",
  order: 0,
  type: TeamMemberType.Instructor,
  active: true,
  visible_on_public_team: true,
  /** ISO `yyyy-mm-dd` for the date input; empty string = no expiration. */
  visible_until_date: "",
};

type TypeFilter = "all" | TeamMemberType;

export default function AdminTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const { message: toastMessage, showError, dismiss: dismissToast } = useToast();

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("team").select("*").order("order");
    setMembers((data as TeamMember[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    const nextOrder = members.length > 0 ? Math.max(...members.map((m) => m.order)) + 1 : 1;
    setForm({ ...emptyForm, order: nextOrder });
    setView("edit");
  }

  function openEdit(m: TeamMember) {
    setEditing(m);
    setForm({
      name: m.name,
      role: m.role,
      belt: m.belt,
      bio: m.bio,
      photo_url: m.photo_url ?? "",
      slug: m.slug,
      order: m.order,
      type: m.type,
      active: m.active,
      visible_on_public_team: m.visible_on_public_team ?? true,
      // `visible_until` is a timestamptz in the DB; the <input type="date">
      // wants `yyyy-mm-dd` only.
      visible_until_date: m.visible_until ? m.visible_until.slice(0, 10) : "",
    });
    setView("edit");
  }

  async function handleSave() {
    if (!form.name.trim() || !form.slug.trim()) return;
    const editingRef = editing;
    // Translate the date-only input back into a timestamptz string
    // (end-of-day in local time → server converts as needed).
    const visibleUntilIso = form.visible_until_date
      ? new Date(`${form.visible_until_date}T23:59:59`).toISOString()
      : null;
    const { visible_until_date: _vud, ...rest } = form;
    const data = {
      ...rest,
      photo_url: form.photo_url || "",
      visible_until: visibleUntilIso,
    };

    if (editingRef) {
      // Optimistic update
      const optimistic: TeamMember = {
        ...editingRef,
        ...data,
        type: data.type as TeamMemberType,
        belt: data.belt as BeltColor,
      };
      setMembers((prev) => prev.map((m) => m.id === editingRef.id ? optimistic : m));
      setView("list");
      try {
        await updateTeamMember(editingRef.id, data);
      } catch {
        setMembers((prev) => prev.map((m) => m.id === editingRef.id ? editingRef : m));
        showError("Failed to save changes. Please try again.");
      }
    } else {
      // Optimistic create — navigate first, sync in background
      setSaving(true);
      setView("list");
      setSaving(false);
      try {
        await createTeamMember(data);
        load(); // background refresh
      } catch {
        showError("Failed to add team member. Please try again.");
      }
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this team member?")) return;
    const snapshot = members;
    setMembers((prev) => prev.filter((m) => m.id !== id));
    try {
      await deleteTeamMember(id);
    } catch {
      setMembers(snapshot);
      showError("Failed to delete team member. Please try again.");
    }
  }

  const { reorder, error: reorderError } = useOptimisticReorder(members, setMembers, "order", "id");

  async function handleReorder(id: number, direction: "up" | "down", currentOrder: number) {
    const member = members.find((m) => m.id === id);
    if (!member) return;
    await reorder(member, direction, () => reorderTeamMember(id, direction, currentOrder));
  }

  async function handleToggleActive(id: number, active: boolean) {
    setMembers((prev) => prev.map((m) => m.id === id ? { ...m, active: !active } : m));
    try {
      await toggleTeamActive(id, !active);
    } catch {
      setMembers((prev) => prev.map((m) => m.id === id ? { ...m, active } : m));
      showError("Failed to update status. Please try again.");
    }
  }

  return (
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
        <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setView("list")} className="text-sm text-muted hover:text-black">
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
            </button>
            <h1 className="font-display text-2xl sm:text-3xl text-black">
              {editing ? "Edit Member" : "Add Member"}
            </h1>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Slug</label>
                <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="e.g. rob-ables"
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Role / Title</label>
              <input type="text" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="e.g. Head Coach"
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Level</label>
                <select value={form.belt} onChange={(e) => setForm({ ...form, belt: e.target.value as BeltColor })}
                  className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black">
                  {Object.values(BeltColor).map((b) => (
                    <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TeamMemberType })}
                  className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black">
                  {Object.values(TeamMemberType).map((t) => (
                    <option key={t} value={t}>{TEAM_TYPE_CONFIG[t].label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Photo URL</label>
              <input
                type="text"
                value={form.photo_url}
                onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
                placeholder="https://... or select from library below"
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
              />
              <div className="mt-2">
                <p className="text-xs text-muted mb-2">Or pick from media library:</p>
                <AssetBrowser selectable onSelect={(url) => setForm((f) => ({ ...f, photo_url: url }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Bio</label>
              <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={4} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Display Order</label>
                <input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
                  <span className="text-sm text-ink">Active</span>
                </label>
              </div>
            </div>

            {/* Public /team visibility — separate from `active` so we can
                keep an instructor active in the schedule dropdown without
                surfacing them on the public site (e.g. visiting coaches). */}
            <div className="border-t border-line pt-4 space-y-3">
              <div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.visible_on_public_team}
                    onChange={(e) => setForm({ ...form, visible_on_public_team: e.target.checked })}
                    className="rounded mt-0.5"
                  />
                  <span>
                    <span className="text-sm text-ink font-medium">Show on public /team page</span>
                    <span className="block text-xs text-muted mt-0.5">
                      {form.type === TeamMemberType.Guest
                        ? "Guests are hidden by default — opt in to surface this coach publicly."
                        : "When off, the member stays behind the scenes — still assignable to classes."}
                    </span>
                  </span>
                </label>
              </div>
              {form.visible_on_public_team && (
                <div className="pl-6">
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                    Hide after (optional)
                  </label>
                  <input
                    type="date"
                    value={form.visible_until_date}
                    onChange={(e) => setForm({ ...form, visible_until_date: e.target.value })}
                    className="border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
                  />
                  <p className="text-[11px] text-muted mt-1">
                    Useful for visiting coaches with a time-bounded stay. Leave blank for no expiration.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-line">
            <button onClick={() => setView("list")} className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.slug.trim()}
              className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Member"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl text-black">Team</h1>
              <p className="text-sm text-muted mt-0.5">
                {members.filter(m => m.active).length} active · {members.filter(m => !m.active).length} inactive
              </p>
            </div>
            <button
              onClick={openAdd}
              className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors"
            >
              + Add Member
            </button>
          </div>

          {/* Filter bar — chip-style toggles with active count per type. */}
          {!loading && members.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {([
                { value: "all" as TypeFilter, label: "All" },
                { value: TeamMemberType.Owner, label: TEAM_TYPE_CONFIG[TeamMemberType.Owner].label },
                { value: TeamMemberType.HeadCoach, label: TEAM_TYPE_CONFIG[TeamMemberType.HeadCoach].label },
                { value: TeamMemberType.Instructor, label: TEAM_TYPE_CONFIG[TeamMemberType.Instructor].label },
                { value: TeamMemberType.Guest, label: TEAM_TYPE_CONFIG[TeamMemberType.Guest].label },
              ]).map(opt => {
                const count = opt.value === "all"
                  ? members.length
                  : members.filter(m => m.type === opt.value).length;
                const active = typeFilter === opt.value;
                if (opt.value !== "all" && count === 0) return null;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTypeFilter(opt.value)}
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
          )}

          {loading ? (
            <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const filtered = members.filter(m => typeFilter === "all" || m.type === typeFilter);
                const canReorder = typeFilter === "all";
                return filtered.map((m, idx) => {
                const beltColor = BELT_COLOR_MAP[m.belt] ?? "var(--color-muted)";
                const typeConfig = TEAM_TYPE_CONFIG[m.type];
                return (
                  <div
                    key={m.id}
                    className={`bg-white border rounded-lg px-4 sm:px-5 py-4 transition-opacity ${
                      m.active ? "border-line" : "border-line opacity-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Reorder — disabled while a filter is active because
                          the underlying swap uses global order numbers. */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          onClick={() => handleReorder(m.id, "up", m.order)}
                          disabled={!canReorder || idx === 0}
                          className="w-8 h-8 flex items-center justify-center text-muted hover:text-black hover:bg-off-white disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none rounded transition-colors"
                          title={canReorder ? "Move up" : "Clear filter to reorder"}
                        ><ChevronUp className="w-4 h-4" /></button>
                        <button
                          onClick={() => handleReorder(m.id, "down", m.order)}
                          disabled={!canReorder || idx === filtered.length - 1}
                          className="w-8 h-8 flex items-center justify-center text-muted hover:text-black hover:bg-off-white disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none rounded transition-colors"
                          title={canReorder ? "Move down" : "Clear filter to reorder"}
                        ><ChevronDown className="w-4 h-4" /></button>
                      </div>

                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: beltColor === "var(--color-belt-white)" ? "var(--color-muted)" : beltColor }}
                      >
                        {m.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photo_url} alt={m.name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          getInitials(m.name)
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-ink">{m.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeConfig.className}`}>
                            {typeConfig.label}
                          </span>
                          {!m.active && (
                            <span className="text-xs bg-disabled-light text-muted px-2 py-0.5 rounded">Inactive</span>
                          )}
                          {!m.visible_on_public_team && (
                            <span className="text-xs bg-paper text-muted border border-line px-2 py-0.5 rounded" title="Hidden from public /team">
                              Internal
                            </span>
                          )}
                          {m.visible_until && new Date(m.visible_until) < new Date() && (
                            <span className="text-xs bg-status-alert-light text-ink border border-status-alert-border px-2 py-0.5 rounded" title={`Hidden since ${new Date(m.visible_until).toLocaleDateString()}`}>
                              Expired
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5 truncate">{m.role} · {m.belt}</p>
                      </div>

                      {/* Belt swatch - hidden on mobile for space */}
                      <div className="w-3 h-8 rounded shrink-0 border border-line hidden sm:block" style={{ backgroundColor: beltColor }} />
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                      <button
                        onClick={() => handleToggleActive(m.id, m.active)}
                        className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                          m.active
                            ? "border-success-border text-success hover:bg-success-light"
                            : "border-line text-muted hover:border-black"
                        }`}
                      >
                        {m.active ? "Active" : "Inactive"}
                      </button>
                      <button onClick={() => openEdit(m)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors">Edit</button>
                      <button onClick={() => handleDelete(m.id)} className="text-xs px-3 py-1.5 rounded border border-line text-danger hover:border-danger transition-colors ml-auto">Delete</button>
                    </div>
                  </div>
                );
              });
              })()}
              {members.length === 0 && (
                <p className="text-muted text-sm text-center py-12">No team members yet.</p>
              )}
              {members.length > 0 && members.filter(m => typeFilter === "all" || m.type === typeFilter).length === 0 && (
                <p className="text-muted text-sm text-center py-12">
                  No {TEAM_TYPE_CONFIG[typeFilter as TeamMemberType]?.label?.toLowerCase() ?? "members"} in this filter.
                </p>
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
