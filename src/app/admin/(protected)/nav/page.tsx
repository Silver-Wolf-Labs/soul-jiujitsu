"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import {
  createNavItem, updateNavItem, deleteNavItem, toggleNavItemActive, reorderNavItem,
  createFooterItem, updateFooterItem, deleteFooterItem, toggleFooterItemActive, reorderFooterItem,
} from "@/lib/actions/nav";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import type { NavItem, FooterItem } from "@/lib/supabase/types";
import { ReorderButtons } from "@/components/ui/ReorderButtons";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import ErrorToast from "@/components/admin/ErrorToast";

const FOOTER_GROUPS = ["Site", "Info", "Connect"];

const emptyNav = { label: "", href: "", display_order: 0 };
const emptyFooter = { label: "", href: "", group_name: "Site", display_order: 0 };

export default function AdminNavPage() {
  const [tab, setTab] = useState<"nav" | "footer">("nav");
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [footerItems, setFooterItems] = useState<FooterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editingNav, setEditingNav] = useState<NavItem | null>(null);
  const [editingFooter, setEditingFooter] = useState<FooterItem | null>(null);
  const [navForm, setNavForm] = useState(emptyNav);
  const [footerForm, setFooterForm] = useState(emptyFooter);
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    const [{ data: nav }, { data: footer }] = await Promise.all([
      supabase.from("nav_items").select("*").order("display_order"),
      supabase.from("footer_items").select("*").order("group_name").order("display_order"),
    ]);
    setNavItems((nav as NavItem[]) ?? []);
    setFooterItems((footer as FooterItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Nav handlers
  function openAddNav() {
    setEditingNav(null);
    setNavForm({ ...emptyNav, display_order: navItems.length + 1 });
    setView("edit");
  }
  function openEditNav(item: NavItem) {
    setEditingNav(item);
    setNavForm({ label: item.label, href: item.href, display_order: item.display_order });
    setView("edit");
  }
  async function saveNav() {
    setSaving(true);
    try {
      if (editingNav) await updateNavItem(editingNav.id, navForm);
      else await createNavItem(navForm);
      await load(); setView("list");
    } finally { setSaving(false); }
  }

  // Footer handlers
  function openAddFooter() {
    setEditingFooter(null);
    setFooterForm({ ...emptyFooter, display_order: footerItems.length + 1 });
    setView("edit");
  }
  function openEditFooter(item: FooterItem) {
    setEditingFooter(item);
    setFooterForm({ label: item.label, href: item.href, group_name: item.group_name, display_order: item.display_order });
    setView("edit");
  }
  async function saveFooter() {
    setSaving(true);
    try {
      if (editingFooter) await updateFooterItem(editingFooter.id, footerForm);
      else await createFooterItem(footerForm);
      await load(); setView("list");
    } finally { setSaving(false); }
  }

  const isNavTab = tab === "nav";

  return (
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="text-sm text-muted hover:text-black">
            <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
          </button>
          <h1 className="font-display text-2xl sm:text-3xl text-black">
            {isNavTab ? (editingNav ? "Edit Nav Link" : "Add Nav Link") : (editingFooter ? "Edit Footer Link" : "Add Footer Link")}
          </h1>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Label</label>
            <input
              type="text"
              value={isNavTab ? navForm.label : footerForm.label}
              onChange={(e) => isNavTab ? setNavForm({ ...navForm, label: e.target.value }) : setFooterForm({ ...footerForm, label: e.target.value })}
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
              placeholder="Schedule"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">URL / Href</label>
            <input
              type="text"
              value={isNavTab ? navForm.href : footerForm.href}
              onChange={(e) => isNavTab ? setNavForm({ ...navForm, href: e.target.value }) : setFooterForm({ ...footerForm, href: e.target.value })}
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
              placeholder="/#schedule"
            />
          </div>
          {!isNavTab && (
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Group</label>
              <select
                value={footerForm.group_name}
                onChange={(e) => setFooterForm({ ...footerForm, group_name: e.target.value })}
                className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black"
              >
                {FOOTER_GROUPS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Display Order</label>
            <input
              type="number"
              value={isNavTab ? navForm.display_order : footerForm.display_order}
              onChange={(e) => isNavTab ? setNavForm({ ...navForm, display_order: Number(e.target.value) }) : setFooterForm({ ...footerForm, display_order: Number(e.target.value) })}
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-line">
          <button onClick={() => setView("list")} className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
          <button
            onClick={isNavTab ? saveNav : saveFooter}
            disabled={saving}
            className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      ) : (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-black">Navigation</h1>
          <p className="text-sm text-muted mt-0.5">Manage nav and footer links shown on the public site.</p>
        </div>
        <button
          onClick={isNavTab ? openAddNav : openAddFooter}
          className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors whitespace-nowrap"
        >
          + Add Link
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-line">
        {(["nav", "footer"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors -mb-px ${
              tab === t ? "border-black text-black" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t === "nav" ? "Nav Links" : "Footer Links"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : isNavTab ? (
        <NavTable
          items={navItems}
          setItems={setNavItems}
          onEdit={openEditNav}
          onDelete={async (id) => { await deleteNavItem(id); await load(); }}
          onToggle={async (id, active) => { await toggleNavItemActive(id, !active); await load(); }}
        />
      ) : (
        <FooterTable
          items={footerItems}
          onEdit={openEditFooter}
          onDelete={async (id) => { await deleteFooterItem(id); await load(); }}
          onToggle={async (id, active) => { await toggleFooterItemActive(id, !active); await load(); }}
          onReorder={async (id, dir, order) => { await reorderFooterItem(id, dir, order); await load(); }}
        />
      )}
    </div>
      )}
    </AdminViewTransition>
  );
}

function NavTable({ items, setItems, onEdit, onDelete, onToggle }: {
  items: NavItem[];
  setItems: (items: NavItem[]) => void;
  onEdit: (item: NavItem) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
}) {
  const { reorder, error: reorderError } = useOptimisticReorder(
    items,
    setItems,
    "display_order",
    "id",
  );

  async function handleReorder(item: NavItem, dir: "up" | "down") {
    await reorder(item, dir, () => reorderNavItem(item.id, dir, item.display_order));
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {items.map((item, idx) => (
          <div key={item.id} className="bg-white border border-line rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ReorderButtons
                onUp={() => handleReorder(item, "up")}
                onDown={() => handleReorder(item, "down")}
                disableUp={idx === 0}
                disableDown={idx === items.length - 1}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{item.label}</span>
                  <button
                    onClick={() => onToggle(item.id, item.active)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors flex-shrink-0 ${
                      item.active ? "border-success-border text-success hover:bg-success-light" : "border-line text-muted hover:border-black"
                    }`}
                  >
                    {item.active ? "Active" : "Hidden"}
                  </button>
                </div>
                <p className="text-xs text-muted font-mono mt-1 truncate">{item.href}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
              <button onClick={() => onEdit(item)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:underline">Edit</button>
              <button onClick={() => { if (confirm("Delete this link?")) onDelete(item.id); }} className="text-xs px-3 py-1.5 rounded border border-line text-danger hover:underline ml-auto">Delete</button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="px-4 py-8 text-center text-muted text-sm">No nav items. Add one above.</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="bg-white border border-line rounded-lg overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-off-white text-xs text-muted uppercase tracking-wide">
              <th className="text-left px-2 py-3 w-14" />
              <th className="text-left px-4 py-3">Label</th>
              <th className="text-left px-4 py-3">URL</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className={`border-b border-line last:border-0 ${i % 2 === 1 ? "bg-off-white/40" : ""}`}>
                <td className="px-2 py-3">
                  <ReorderButtons
                    onUp={() => handleReorder(item, "up")}
                    onDown={() => handleReorder(item, "down")}
                    disableUp={i === 0}
                    disableDown={i === items.length - 1}
                  />
                </td>
                <td className="px-4 py-3 font-medium text-ink">{item.label}</td>
                <td className="px-4 py-3 text-muted font-mono text-xs">{item.href}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggle(item.id, item.active)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      item.active ? "border-success-border text-success hover:bg-success-light" : "border-line text-muted hover:border-black"
                    }`}
                  >
                    {item.active ? "Active" : "Hidden"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => onEdit(item)} className="text-xs text-blue-mid hover:underline">Edit</button>
                    <button onClick={() => { if (confirm("Delete this link?")) onDelete(item.id); }} className="text-xs text-danger hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No nav items. Add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ErrorToast message={reorderError} />
    </>
  );
}

function FooterTable({ items, onEdit, onDelete, onToggle, onReorder }: {
  items: FooterItem[];
  onEdit: (item: FooterItem) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
  onReorder: (id: number, dir: "up" | "down", order: number) => void;
}) {
  // Group-aware neighbours — disable up/down at group boundaries so reorder
  // only ever swaps with an item in the same footer group.
  const boundsFor = (idx: number) => {
    const item = items[idx];
    const prev = items[idx - 1];
    const next = items[idx + 1];
    return {
      disableUp: !prev || prev.group_name !== item.group_name,
      disableDown: !next || next.group_name !== item.group_name,
    };
  };

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {items.map((item, idx) => {
          const { disableUp, disableDown } = boundsFor(idx);
          return (
            <div key={item.id} className="bg-white border border-line rounded-lg p-4">
              <div className="flex items-start gap-3">
                <ReorderButtons
                  onUp={() => onReorder(item.id, "up", item.display_order)}
                  onDown={() => onReorder(item.id, "down", item.display_order)}
                  disableUp={disableUp}
                  disableDown={disableDown}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-ink">{item.label}</span>
                      <span className="text-xs bg-off-white border border-line rounded px-2 py-0.5 flex-shrink-0">{item.group_name}</span>
                    </div>
                    <button
                      onClick={() => onToggle(item.id, item.active)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors flex-shrink-0 ${
                        item.active ? "border-success-border text-success hover:bg-success-light" : "border-line text-muted hover:border-black"
                      }`}
                    >
                      {item.active ? "Active" : "Hidden"}
                    </button>
                  </div>
                  <p className="text-xs text-muted font-mono mt-1 truncate">{item.href}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                <button onClick={() => onEdit(item)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:underline">Edit</button>
                <button onClick={() => { if (confirm("Delete this link?")) onDelete(item.id); }} className="text-xs px-3 py-1.5 rounded border border-line text-danger hover:underline ml-auto">Delete</button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="px-4 py-8 text-center text-muted text-sm">No footer items. Add one above.</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="bg-white border border-line rounded-lg overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-off-white text-xs text-muted uppercase tracking-wide">
              <th className="text-left px-2 py-3 w-14" />
              <th className="text-left px-4 py-3">Label</th>
              <th className="text-left px-4 py-3">Group</th>
              <th className="text-left px-4 py-3">URL</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const { disableUp, disableDown } = boundsFor(i);
              return (
                <tr key={item.id} className={`border-b border-line last:border-0 ${i % 2 === 1 ? "bg-off-white/40" : ""}`}>
                  <td className="px-2 py-3">
                    <ReorderButtons
                      onUp={() => onReorder(item.id, "up", item.display_order)}
                      onDown={() => onReorder(item.id, "down", item.display_order)}
                      disableUp={disableUp}
                      disableDown={disableDown}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{item.label}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-off-white border border-line rounded px-2 py-0.5">{item.group_name}</span>
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{item.href}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggle(item.id, item.active)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        item.active ? "border-success-border text-success hover:bg-success-light" : "border-line text-muted hover:border-black"
                      }`}
                    >
                      {item.active ? "Active" : "Hidden"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => onEdit(item)} className="text-xs text-blue-mid hover:underline">Edit</button>
                      <button onClick={() => { if (confirm("Delete this link?")) onDelete(item.id); }} className="text-xs text-danger hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">No footer items. Add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
