"use client";

/**
 * Generic list + add/edit/reorder/deactivate surface for the four class
 * taxonomy dimensions (modality / level / focus / audience). Specialized
 * per-dimension form fields are passed in via the `renderFormFields`
 * prop.
 *
 * Deactivation confirmation follows LLD §4.2 exactly — see
 * `DeactivateDialog` below for the tri-branch behavior driven by the
 * pre-flight `{ slotCount, checkInCount }` the server action returns.
 */

import { useEffect, useState, type ReactNode } from "react";
import Spinner from "@/components/ui/Spinner";
import { ChevronUp, ChevronDown } from "lucide-react";
import ErrorToast from "@/components/admin/ErrorToast";
import { useToast } from "@/hooks/useToast";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import type { UsageCounts } from "@/lib/actions/class-taxonomy";

export interface TaxonomyRow {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  sort_order: number;
}

export interface TaxonomyManagerProps<T extends TaxonomyRow, F extends Record<string, unknown>> {
  /** Human-readable singular dimension name. "Modality" / "Level" / "Focus" / "Audience". */
  singular: string;
  /** Plural — used for headings and empty-state copy. */
  plural: string;
  /** Current rows to render. Controlled by the parent. */
  rows: T[];
  /** Whether initial fetch is in flight. */
  loading: boolean;
  /** Build the empty form for add. */
  buildEmptyForm: (nextOrder: number) => F;
  /** Build the edit form seed from a row. */
  buildFormFromRow: (row: T) => F;
  /** Render the dimension-specific form fields (name/slug are rendered
   *  by the manager itself; this covers color/kind/age/gender/etc). */
  renderFormFields: (form: F, setForm: (next: F) => void) => ReactNode;
  /** Optional per-row extra info displayed beside the name (e.g. color swatch, kind badge). */
  renderRowMeta?: (row: T) => ReactNode;
  /** Create action. */
  onCreate: (form: F) => Promise<void>;
  /** Update action. */
  onUpdate: (id: number, form: F) => Promise<void>;
  /** Deactivate action — returns usage counts for the confirmation dialog. */
  onDeactivate: (id: number) => Promise<UsageCounts>;
  /** Reactivate. */
  onReactivate: (id: number) => Promise<void>;
  /** Reorder action. */
  onReorder: (id: number, direction: "up" | "down", currentOrder: number) => Promise<void>;
  /** Pre-flight usage query — invoked before opening the dialog. */
  onGetUsage: (id: number) => Promise<UsageCounts>;
  /** Optional hard delete. Not rendered when omitted. */
  onDelete?: (id: number) => Promise<void>;
  /** Refresh after mutations. */
  refresh: () => Promise<void> | void;
}

export default function TaxonomyManager<T extends TaxonomyRow, F extends Record<string, unknown>>(
  props: TaxonomyManagerProps<T, F>,
) {
  const {
    singular,
    plural,
    rows,
    loading,
    buildEmptyForm,
    buildFormFromRow,
    renderFormFields,
    renderRowMeta,
    onCreate,
    onUpdate,
    onDeactivate,
    onReactivate,
    onReorder,
    onGetUsage,
    onDelete,
    refresh,
  } = props;

  const { message, showError, dismiss } = useToast();
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<F | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    row: T;
    usage: UsageCounts;
    mode: "deactivate" | "delete";
  } | null>(null);

  const [localRows, setLocalRows] = useState<T[]>(rows);
  useEffect(() => { setLocalRows(rows); }, [rows]);

  const { reorder, error: reorderError } = useOptimisticReorder(
    localRows,
    setLocalRows,
    "sort_order",
    "id",
  );

  function openAdd() {
    const nextOrder = localRows.length > 0
      ? Math.max(...localRows.map((r) => r.sort_order)) + 10
      : 10;
    setForm(buildEmptyForm(nextOrder));
    setCreating(true);
    setEditing(null);
  }

  function openEdit(row: T) {
    setForm(buildFormFromRow(row));
    setEditing(row);
    setCreating(false);
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
    setForm(null);
  }

  async function handleSave() {
    if (!form) return;
    const name = (form as unknown as { name?: string }).name?.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (editing) {
        await onUpdate(editing.id, form);
      } else {
        await onCreate(form);
      }
      closeForm();
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReorder(row: T, direction: "up" | "down") {
    await reorder(row, direction, () => onReorder(row.id, direction, row.sort_order));
    await refresh();
  }

  async function openDeactivate(row: T) {
    try {
      const usage = await onGetUsage(row.id);
      setPendingAction({ row, usage, mode: "deactivate" });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not check usage.");
    }
  }

  async function openDelete(row: T) {
    if (!onDelete) return;
    try {
      const usage = await onGetUsage(row.id);
      setPendingAction({ row, usage, mode: "delete" });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not check usage.");
    }
  }

  async function handleConfirmPending() {
    if (!pendingAction) return;
    try {
      if (pendingAction.mode === "deactivate") {
        await onDeactivate(pendingAction.row.id);
      } else if (pendingAction.mode === "delete" && onDelete) {
        await onDelete(pendingAction.row.id);
      }
      setPendingAction(null);
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  async function handleReactivate(row: T) {
    try {
      await onReactivate(row.id);
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not reactivate.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          {localRows.filter((r) => r.active).length} active ·{" "}
          {localRows.filter((r) => !r.active).length} inactive
        </p>
        <button
          onClick={openAdd}
          className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors"
        >
          + Add {singular}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : localRows.length === 0 ? (
        <p className="text-muted text-sm text-center py-12">No {plural.toLowerCase()} yet.</p>
      ) : (
        <div className="space-y-2">
          {localRows.map((row, idx) => (
            <div
              key={row.id}
              className={`bg-white border rounded-lg px-4 py-3 transition-opacity ${
                row.active ? "border-line" : "border-line opacity-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => handleReorder(row, "up")}
                    disabled={idx === 0}
                    className="w-7 h-7 flex items-center justify-center text-muted hover:text-black hover:bg-off-white disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                    title="Move up"
                  ><ChevronUp className="w-3.5 h-3.5" /></button>
                  <button
                    onClick={() => handleReorder(row, "down")}
                    disabled={idx === localRows.length - 1}
                    className="w-7 h-7 flex items-center justify-center text-muted hover:text-black hover:bg-off-white disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                    title="Move down"
                  ><ChevronDown className="w-3.5 h-3.5" /></button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink">{row.name}</span>
                    <span className="text-xs text-muted font-mono">{row.slug}</span>
                    {renderRowMeta?.(row)}
                    {!row.active && (
                      <span className="text-xs bg-disabled-light text-muted px-2 py-0.5 rounded">Inactive</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(row)}
                    className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors"
                  >
                    Edit
                  </button>
                  {row.active ? (
                    <button
                      onClick={() => openDeactivate(row)}
                      className="text-xs px-3 py-1.5 rounded border border-line text-ink hover:border-black transition-colors"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(row)}
                      className="text-xs px-3 py-1.5 rounded border border-success-border text-success hover:bg-success-light transition-colors"
                    >
                      Reactivate
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => openDelete(row)}
                      className="text-xs px-3 py-1.5 rounded border border-line text-danger hover:border-danger transition-colors"
                      title={`Hard-delete this ${singular.toLowerCase()}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit modal */}
      {form && (creating || editing) && (
        <FormModal
          title={editing ? `Edit ${singular}` : `Add ${singular}`}
          saving={saving}
          onCancel={closeForm}
          onSave={handleSave}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Name</label>
                <input
                  type="text"
                  value={(form as unknown as { name: string }).name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value } as F)}
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  Slug <span className="text-muted font-normal normal-case">(optional — auto-generated)</span>
                </label>
                <input
                  type="text"
                  value={(form as unknown as { slug?: string }).slug ?? ""}
                  onChange={(e) => setForm({ ...form, slug: e.target.value } as F)}
                  placeholder="auto"
                  className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black font-mono"
                />
              </div>
            </div>
            {renderFormFields(form, (next) => setForm(next))}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Sort order</label>
              <input
                type="number"
                value={(form as unknown as { sort_order?: number }).sort_order ?? 0}
                onChange={(e) =>
                  setForm({ ...form, sort_order: parseInt(e.target.value) || 0 } as F)
                }
                className="w-32 border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* Deactivate / delete confirmation */}
      {pendingAction && (
        <DeactivateDialog
          mode={pendingAction.mode}
          name={pendingAction.row.name}
          usage={pendingAction.usage}
          onCancel={() => setPendingAction(null)}
          onConfirm={handleConfirmPending}
        />
      )}

      <ErrorToast message={reorderError} />
      <ErrorToast message={message} onDismiss={dismiss} />
    </div>
  );
}

// ── Modal chrome ────────────────────────────────────────────────────────

function FormModal({
  title,
  saving,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-display text-lg text-black">{title}</h2>
          <button
            onClick={onCancel}
            className="text-muted hover:text-black"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-line">
          <button
            onClick={onCancel}
            className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deactivation confirmation (LLD §4.2) ────────────────────────────────

function DeactivateDialog({
  mode,
  name,
  usage,
  onCancel,
  onConfirm,
}: {
  mode: "deactivate" | "delete";
  name: string;
  usage: UsageCounts;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const verb = mode === "delete" ? "Delete" : "Deactivate";
  const verbLower = mode === "delete" ? "delete" : "deactivate";

  // LLD §4.2 branch rules, adapted for both deactivate and delete.
  const cleanBranch = usage.slotCount === 0 && usage.checkInCount === 0;
  const slotGatedBranch = usage.slotCount > 0;
  const historicalBranch = usage.slotCount === 0 && usage.checkInCount > 0;

  const requiresTyping = slotGatedBranch;
  const canConfirm = !requiresTyping || typed === name;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="font-display text-lg text-black">{verb} “{name}”?</h2>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-ink">
          {cleanBranch && (
            <p>
              Nothing currently references this. {verb} it?
            </p>
          )}
          {slotGatedBranch && (
            <>
              <p>
                <strong>{usage.slotCount}</strong> active slot{usage.slotCount === 1 ? "" : "s"} reference this. They&rsquo;ll keep showing it but new slots won&rsquo;t see this option.
              </p>
              <p>
                Type <code className="bg-off-white border border-line rounded px-1 py-0.5 text-xs">{name}</code> to continue.
              </p>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={name}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
                autoFocus
              />
            </>
          )}
          {historicalBranch && (
            <p>
              <strong>{usage.checkInCount}</strong> historical check-in{usage.checkInCount === 1 ? "" : "s"} {usage.checkInCount === 1 ? "has" : "have"} this attribution. They&rsquo;re unaffected.
            </p>
          )}
          {mode === "delete" && slotGatedBranch && (
            <p className="text-danger text-xs">
              Delete is blocked while active slots reference this. Deactivate instead.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-line">
          <button
            onClick={onCancel}
            className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || (mode === "delete" && slotGatedBranch)}
            className={`text-sm px-4 py-2 rounded text-white transition-colors disabled:opacity-50 ${
              mode === "delete" ? "bg-danger hover:opacity-90" : "bg-black hover:bg-near-black"
            }`}
          >
            {verb}
          </button>
        </div>
      </div>
    </div>
  );
}
