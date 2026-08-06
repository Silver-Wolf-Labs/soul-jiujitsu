"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, X, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import {
  createMembershipPlan,
  updateMembershipPlan,
  changePlanPrice,
  archiveMembershipPlan,
  restoreMembershipPlan,
  reorderMembershipPlan,
} from "@/lib/actions/membership-plans";
import { ReorderButtons } from "@/components/ui/ReorderButtons";
import { HIGHLIGHT_COLOR_KEYS, HIGHLIGHT_BG_CLASS, HIGHLIGHT_TEXT_COLOR, HIGHLIGHT_BORDER_HEX, HIGHLIGHT_LABEL } from "@/lib/pricing-colors";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import type { MembershipPlan } from "@/lib/supabase/types";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import ErrorToast from "@/components/admin/ErrorToast";

type PlanWithCount = MembershipPlan & { active_member_count: number };
type BillingInterval = "month" | "year" | "one_time";

function formatPrice(cents: number, interval: BillingInterval) {
  const dollars = (cents / 100).toFixed(0);
  if (interval === "one_time") return `$${dollars} one-time`;
  return `$${dollars}/${interval === "month" ? "mo" : "yr"}`;
}

const INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: "Monthly",
  year: "Yearly",
  one_time: "One-time (Drop-In)",
};

const LABEL_PRESETS = ["Most Popular", "Best Value", "Limited Offer", "New"] as const;

const emptyForm = {
  name: "",
  description: "",
  price_dollars: "",
  billing_interval: "month" as BillingInterval,
  trial_days: "0",
  max_classes_per_week: "",
  period_display: "",
  visible: true,
  display_order: "0",
  features: [""] as string[],
  highlight_color: "" as string,   // "" = none, else one of HIGHLIGHT_COLOR_KEYS
  highlight_label: "",
  custom_label: false,
  cta_label: "Get Started",
  cta_href: "/join",
};

type FormState = typeof emptyForm;

const inputCls = "w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black";
const labelCls = "block text-xs font-semibold text-muted uppercase tracking-wide mb-1";

export default function AdminMembershipPlansPage() {
  const [plans, setPlans] = useState<PlanWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"plan" | "display">("plan");
  const [priceModalPlan, setPriceModalPlan] = useState<PlanWithCount | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [priceScope, setPriceScope] = useState<"new_only" | "all_current">("new_only");
  const [priceSaving, setPriceSaving] = useState(false);
  const [planMembers, setPlanMembers] = useState<{ id: number; member_id: number; member_name: string }[]>([]);
  const [excludedMemberIds, setExcludedMemberIds] = useState<number[]>([]);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("membership_plans")
      .select("*, member_memberships(id, status)")
      .order("display_order")
      .order("created_at");
    const rows = (data ?? []).map((p: Record<string, unknown>) => {
      const mbs = (p.member_memberships as Array<{ status: string }> | null) ?? [];
      return {
        ...p,
        features: (p.features as string[]) ?? [],
        active_member_count: mbs.filter(m => ["active", "trialing"].includes(m.status)).length,
      } as PlanWithCount;
    });
    setPlans(rows);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function tf(field: keyof FormState) {
    return {
      value: form[field] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value })),
    };
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setActiveTab("plan");
    setView("edit");
  }

  function openEdit(plan: PlanWithCount) {
    setEditing(plan);
    const labelIsPreset = LABEL_PRESETS.includes((plan.highlight_label ?? "") as typeof LABEL_PRESETS[number]);
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      price_dollars: (plan.price_cents / 100).toFixed(0),
      billing_interval: plan.billing_interval,
      trial_days: String(plan.trial_days),
      max_classes_per_week: plan.max_classes_per_week ? String(plan.max_classes_per_week) : "",
      period_display: plan.period_display ?? "",
      visible: plan.visible,
      display_order: String(plan.display_order),
      features: plan.features.length > 0 ? plan.features : [""],
      highlight_color: plan.highlight_color ?? "",
      highlight_label: plan.highlight_label ?? "",
      custom_label: !!plan.highlight_label && !labelIsPreset,
      cta_label: plan.cta_label,
      cta_href: plan.cta_href,
    });
    setActiveTab("plan");
    setView("edit");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const hasColor = !!form.highlight_color;
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_cents: Math.round(parseFloat(form.price_dollars) * 100),
        billing_interval: form.billing_interval,
        trial_days: parseInt(form.trial_days) || 0,
        max_classes_per_week: form.max_classes_per_week ? parseInt(form.max_classes_per_week) : null,
        period_display: form.period_display.trim() || null,
        visible: form.visible,
        display_order: parseInt(form.display_order) || 0,
        features: form.features.map(f => f.trim()).filter(Boolean),
        highlight: hasColor,
        highlight_color: form.highlight_color || null,
        highlight_label: hasColor ? (form.highlight_label.trim() || null) : null,
        cta_label: form.cta_label.trim() || "Get Started",
        cta_href: form.cta_href.trim() || "/join",
      };
      if (editing) await updateMembershipPlan(editing.id, payload);
      else await createMembershipPlan(payload);
      await load();
      setView("list");
    } finally { setSaving(false); }
  }

  async function openPriceModal(plan: PlanWithCount) {
    setPriceModalPlan(plan);
    setNewPrice("");
    setPriceScope("new_only");
    setExcludedMemberIds([]);
    // Load active members on this plan for the exclusion picker
    const supabase = createClient();
    const { data } = await supabase
      .from("member_memberships")
      .select("id, member_id, members(first_name, last_name)")
      .eq("plan_id", plan.id)
      .in("status", ["active", "trialing", "paused"]);
    setPlanMembers(
      (data ?? []).map((r: Record<string, unknown>) => {
        const m = r.members as { first_name: string; last_name: string } | null;
        return {
          id: r.id as number,
          member_id: r.member_id as number,
          member_name: m ? `${m.first_name} ${m.last_name}` : "Unknown",
        };
      })
    );
  }

  function toggleExclusion(member_id: number) {
    setExcludedMemberIds(prev =>
      prev.includes(member_id) ? prev.filter(id => id !== member_id) : [...prev, member_id]
    );
  }

  async function handlePriceChange() {
    if (!priceModalPlan || !newPrice) return;
    setPriceSaving(true);
    try {
      await changePlanPrice(
        priceModalPlan.id,
        Math.round(parseFloat(newPrice) * 100),
        priceScope,
        priceScope === "all_current" ? excludedMemberIds : []
      );
      await load();
      setPriceModalPlan(null);
    } finally { setPriceSaving(false); }
  }

  const { reorder, error: reorderError } = useOptimisticReorder(
    plans,
    setPlans,
    "display_order",
    "id",
  );

  async function handleReorder(plan: PlanWithCount, direction: "up" | "down") {
    await reorder(plan, direction, () => reorderMembershipPlan(plan.id, direction, plan.display_order));
  }

  const visible = plans.filter(p => showArchived ? p.status === "archived" : p.status === "active");

  return (
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
      <div className="p-4 sm:p-6 lg:p-8 max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="text-sm text-muted hover:text-black">
            <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
          </button>
          <h1 className="font-display text-2xl sm:text-3xl text-black">
            {editing ? "Edit Plan" : "New Plan"}
          </h1>
        </div>

        <div className="flex border-b border-line mb-5">
          {(["plan", "display"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === tab ? "border-black text-black" : "border-transparent text-muted hover:text-ink"}`}>
              {tab === "plan" ? "Plan Details" : "Pricing Card"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === "plan" && (
            <>
              <div>
                <label className={labelCls}>Name *</label>
                <input {...tf("name")} className={inputCls} placeholder="Individual Unlimited" />
              </div>
              <div>
                <label className={labelCls}>Internal Description</label>
                <input {...tf("description")} className={inputCls} placeholder="Optional note" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Price ($) *</label>
                  <input type="number" min="0" step="1" {...tf("price_dollars")} className={inputCls} placeholder="189" />
                </div>
                <div>
                  <label className={labelCls}>Billing</label>
                  <select value={form.billing_interval} onChange={e => setForm(p => ({ ...p, billing_interval: e.target.value as BillingInterval }))} className={`${inputCls} bg-white`}>
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                    <option value="one_time">One-time (Drop-In)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Trial Days</label>
                  <input type="number" min="0" {...tf("trial_days")} className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Max Classes / Week</label>
                  <input type="number" min="1" {...tf("max_classes_per_week")} className={inputCls} placeholder="Unlimited" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Period display <span className="font-normal normal-case text-muted/70">(optional override)</span></label>
                <input {...tf("period_display")} className={inputCls} placeholder="e.g. /month, per visit, /month · unlimited" />
                <p className="text-xs text-muted mt-1">Shown under the price on the pricing card. Leave blank to auto-format from billing interval.</p>
              </div>
              {editing && (
                <p className="text-xs text-muted bg-off-white border border-line rounded p-3">
                  To change the price with grandfather controls, use the <strong>Price</strong> action from the plans table after saving.
                </p>
              )}
            </>
          )}

          {activeTab === "display" && (
            <>
              {/* Visibility */}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Show on public pricing page</p>
                  <p className="text-xs text-muted mt-0.5">Hidden plans can still be assigned to members manually.</p>
                </div>
                <button type="button" onClick={() => setForm(p => ({ ...p, visible: !p.visible }))}
                  className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${form.visible ? "bg-black" : "bg-line"}`}>
                  <span className={`absolute left-0 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.visible ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>

              {/* Order + Button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Display Order</label>
                  <input type="number" min="0" {...tf("display_order")} className={inputCls} placeholder="1" />
                </div>
                <div>
                  <label className={labelCls}>Button Text</label>
                  <input {...tf("cta_label")} className={inputCls} placeholder="Get Started" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Button Link</label>
                <input {...tf("cta_href")} className={inputCls} placeholder="/join" />
              </div>

              {/* Features */}
              <div>
                <label className={labelCls}>Features <span className="font-normal normal-case text-muted/70">({form.features.filter(f => f.trim()).length}/5)</span></label>
                <div className="space-y-2">
                  {form.features.map((feat, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={feat}
                        onChange={e => {
                          const next = [...form.features];
                          next[i] = e.target.value;
                          setForm(p => ({ ...p, features: next }));
                        }}
                        placeholder={`Feature ${i + 1}`}
                        className={`flex-1 ${inputCls}`}
                      />
                      {form.features.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, features: p.features.filter((_, j) => j !== i) }))}
                          className="text-muted hover:text-danger transition-colors text-xl leading-none px-1 flex-shrink-0"
                          aria-label="Remove feature"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {form.features.length < 5 && (
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, features: [...p.features, ""] }))}
                    className="mt-2 text-xs text-blue-mid hover:underline"
                  >
                    + Add feature
                  </button>
                )}
              </div>

              {/* Highlight color (card border + badge) */}
              <div>
                <label className={`${labelCls} mb-2`}>Card highlight color</label>
                <p className="text-xs text-muted mb-2 -mt-1">Sets the card border color and badge background. Belt colors for brand consistency.</p>
                <div className="flex gap-2 flex-wrap">
                  {/* None */}
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, highlight_color: "", highlight_label: "" }))}
                    className={`px-3 py-1.5 rounded text-xs font-semibold border-2 transition-all bg-white text-ink ${
                      !form.highlight_color ? "border-black" : "border-line hover:border-black/40"
                    }`}
                  >
                    None
                  </button>
                  {HIGHLIGHT_COLOR_KEYS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, highlight_color: c }))}
                      className={`px-3 py-1.5 rounded text-xs font-semibold border-2 transition-all ${
                        HIGHLIGHT_BG_CLASS[c]
                      } ${HIGHLIGHT_TEXT_COLOR[c]} ${
                        form.highlight_color === c ? "border-black scale-105" : "border-transparent"
                      }`}
                      style={{ borderColor: form.highlight_color === c ? HIGHLIGHT_BORDER_HEX[c] : undefined }}
                    >
                      {HIGHLIGHT_LABEL[c]}
                    </button>
                  ))}
                </div>
                {/* Preview */}
                {form.highlight_color && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted">Preview:</span>
                    <div
                      className="rounded px-4 py-1 text-[10px] font-bold tracking-wider uppercase"
                      style={{
                        background: HIGHLIGHT_BORDER_HEX[form.highlight_color],
                        color: form.highlight_color === "yellow" ? "var(--color-black)" : "var(--color-white)",
                      }}
                    >
                      {form.highlight_label || "Featured"}
                    </div>
                  </div>
                )}
              </div>

              {/* Badge label (only when a color is selected) */}
              {form.highlight_color && (
                <div>
                  <label className={`${labelCls} mb-2`}>Badge label</label>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {LABEL_PRESETS.map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, highlight_label: preset, custom_label: false }))}
                        className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                          !form.custom_label && form.highlight_label === preset
                            ? "bg-black text-white border-black"
                            : "border-line text-ink hover:border-black"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, custom_label: true, highlight_label: "" }))}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        form.custom_label
                          ? "bg-black text-white border-black"
                          : "border-line text-ink hover:border-black"
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {form.custom_label && (
                    <input
                      {...tf("highlight_label")}
                      className={inputCls}
                      placeholder="Enter custom label..."
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-line">
          <button onClick={() => setView("list")} className="flex-1 sm:flex-none text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.price_dollars}
            className="flex-1 sm:flex-none text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Save Plan"}
          </button>
        </div>
      </div>
      ) : (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-black">Membership Plans</h1>
          <p className="text-sm text-muted mt-1">
            Each plan controls both the{" "}
            <a href="/#pricing" target="_blank" rel="noopener noreferrer" className="text-blue-mid hover:underline font-medium inline-flex items-center gap-0.5">
              public pricing page <ExternalLink className="w-3 h-3" />
            </a>
            {" "}and member billing.
          </p>
        </div>
        <button onClick={openAdd} className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors whitespace-nowrap">
          + New Plan
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b border-line">
        {([false, true] as const).map(archived => (
          <button key={String(archived)} onClick={() => setShowArchived(archived)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px ${showArchived === archived ? "border-black text-black" : "border-transparent text-muted hover:text-ink"}`}>
            {archived ? "Archived" : "Active"}
            <span className="ml-1.5 text-xs text-muted">{plans.filter(p => p.status === (archived ? "archived" : "active")).length}</span>
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner label="Loading" /></div> : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {visible.map((plan) => (
              <div key={plan.id} className="bg-white border border-line rounded-lg p-4">
                <div className="flex items-start gap-3">
                  {!showArchived && (
                    <ReorderButtons
                      onUp={() => handleReorder(plan, "up")}
                      onDown={() => handleReorder(plan, "down")}
                      disableUp={visible.indexOf(plan) === 0}
                      disableDown={visible.indexOf(plan) === visible.length - 1}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink">{plan.name}</span>
                      {plan.highlight && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plan.highlight_color ? HIGHLIGHT_BG_CLASS[plan.highlight_color] : "bg-black"} ${plan.highlight_color ? HIGHLIGHT_TEXT_COLOR[plan.highlight_color] : "text-white"}`}
                        >
                          {plan.highlight_label || "Featured"}
                        </span>
                      )}
                    </div>
                    {plan.description && <div className="text-xs text-muted mt-0.5">{plan.description}</div>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
                  <div>
                    <span className="text-muted text-xs">Price</span>
                    <div className="font-medium tabular-nums">{formatPrice(plan.price_cents, plan.billing_interval)}</div>
                  </div>
                  <div>
                    <span className="text-muted text-xs">Interval</span>
                    <div className="text-muted">{INTERVAL_LABELS[plan.billing_interval]}</div>
                  </div>
                  <div>
                    <span className="text-muted text-xs">Members</span>
                    <div className="text-muted">{plan.active_member_count} active</div>
                  </div>
                  <div>
                    <span className="text-muted text-xs">Public</span>
                    <div>
                      {plan.visible
                        ? <span className="text-xs text-success font-medium">Visible</span>
                        : <span className="text-xs text-muted">Hidden</span>}
                    </div>
                  </div>
                  {plan.trial_days > 0 && (
                    <div>
                      <span className="text-muted text-xs">Trial</span>
                      <div className="text-muted">{plan.trial_days}d</div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                  {plan.status === "active" && (
                    <>
                      <button onClick={() => openEdit(plan)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors">Edit</button>
                      <button onClick={() => openPriceModal(plan)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors">Price</button>
                      <button onClick={async () => { if (confirm(`Archive "${plan.name}"? Members on this plan are unaffected.`)) { await archiveMembershipPlan(plan.id); await load(); } }} className="text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-ink hover:border-black transition-colors">Archive</button>
                    </>
                  )}
                  {plan.status === "archived" && (
                    <button onClick={async () => { await restoreMembershipPlan(plan.id); await load(); }} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors">Restore</button>
                  )}
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="text-center text-muted text-sm py-8">No {showArchived ? "archived" : "active"} plans.</p>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block bg-white border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-off-white text-xs text-muted uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Plan</th>
                  <th className="px-4 py-3" />
                  <th className="text-left px-4 py-3">Price</th>
                  <th className="text-left px-4 py-3">Interval</th>
                  <th className="text-left px-4 py-3">Trial</th>
                  <th className="text-left px-4 py-3">Members</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Public</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((plan, i) => (
                  <tr key={plan.id} className={`border-b border-line last:border-0 ${i % 2 === 1 ? "bg-off-white/40" : ""}`}>
                    <td className="px-2 py-3">
                      {!showArchived && (
                        <ReorderButtons
                          onUp={() => handleReorder(plan, "up")}
                          onDown={() => handleReorder(plan, "down")}
                          disableUp={i === 0}
                          disableDown={i === visible.length - 1}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink">{plan.name}</span>
                        {plan.highlight && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plan.highlight_color ? HIGHLIGHT_BG_CLASS[plan.highlight_color] : "bg-black"} ${plan.highlight_color ? HIGHLIGHT_TEXT_COLOR[plan.highlight_color] : "text-white"}`}
                          >
                            {plan.highlight_label || "Featured"}
                          </span>
                        )}
                      </div>
                      {plan.description && <div className="text-xs text-muted mt-0.5">{plan.description}</div>}
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums">{formatPrice(plan.price_cents, plan.billing_interval)}</td>
                    <td className="px-4 py-3 text-muted">{INTERVAL_LABELS[plan.billing_interval]}</td>
                    <td className="px-4 py-3 text-muted">{plan.trial_days > 0 ? `${plan.trial_days}d` : "\u2014"}</td>
                    <td className="px-4 py-3"><span className="text-xs text-muted">{plan.active_member_count} active</span></td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {plan.visible
                        ? <span className="text-xs text-success font-medium">Visible</span>
                        : <span className="text-xs text-muted">Hidden</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {plan.status === "active" && (
                          <>
                            <button onClick={() => openEdit(plan)} className="text-xs text-blue-mid hover:underline">Edit</button>
                            <button onClick={() => openPriceModal(plan)} className="text-xs text-blue-mid hover:underline">Price</button>
                            <button onClick={async () => { if (confirm(`Archive "${plan.name}"? Members on this plan are unaffected.`)) { await archiveMembershipPlan(plan.id); await load(); } }} className="text-xs text-muted hover:text-ink">Archive</button>
                          </>
                        )}
                        {plan.status === "archived" && (
                          <button onClick={async () => { await restoreMembershipPlan(plan.id); await load(); }} className="text-xs text-blue-mid hover:underline">Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted text-sm">No {showArchived ? "archived" : "active"} plans.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}


      {/* -- Change Price Modal ------------------------------------------------ */}
      {priceModalPlan && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-start justify-center z-50 overflow-y-auto md:px-4 md:py-8" onClick={() => setPriceModalPlan(null)}>
          <div className="bg-white w-full h-full md:h-auto md:rounded-lg md:shadow-xl md:max-w-md md:max-h-[90vh] overflow-y-auto px-4 sm:px-6 py-5 sm:py-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl text-black mb-1">Change Price</h2>
            <p className="text-sm text-muted mb-5">
              {priceModalPlan.name} — currently {formatPrice(priceModalPlan.price_cents, priceModalPlan.billing_interval)}
            </p>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>New Price ($)</label>
                <input type="number" min="0" step="1" value={newPrice} onChange={e => setNewPrice(e.target.value)} className={inputCls} placeholder="199" />
              </div>
              <div>
                <label className={`${labelCls} mb-2`}>Who does this apply to?</label>
                <div className="space-y-2">
                  {([
                    ["new_only", "New subscribers only", "Existing members keep their locked price — the grandfather-safe option."],
                    ["all_current", `All current subscribers (${priceModalPlan.active_member_count} member${priceModalPlan.active_member_count !== 1 ? "s" : ""})`, "Updates the locked price for all active, trialing, and paused members. Individual overrides remain unchanged."],
                  ] as const).map(([val, label, desc]) => (
                    <label key={val} className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${priceScope === val ? "border-black bg-off-white" : "border-line hover:border-black/30"}`}>
                      <input type="radio" name="scope" value={val} checked={priceScope === val} onChange={() => setPriceScope(val)} className="mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-ink">{label}</div>
                        <div className="text-xs text-muted mt-0.5">{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {priceScope === "all_current" && planMembers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={labelCls}>
                      Exclude members ({excludedMemberIds.length} of {planMembers.length} excluded)
                    </label>
                    {excludedMemberIds.length > 0 && (
                      <button onClick={() => setExcludedMemberIds([])} className="text-xs text-muted hover:text-black">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="border border-line rounded max-h-40 overflow-y-auto divide-y divide-line">
                    {planMembers.map(m => (
                      <label key={m.member_id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-off-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={excludedMemberIds.includes(m.member_id)}
                          onChange={() => toggleExclusion(m.member_id)}
                          className="rounded"
                        />
                        <span className="text-sm text-ink">{m.member_name}</span>
                        {excludedMemberIds.includes(m.member_id) && (
                          <span className="ml-auto text-xs text-muted italic">keeps old price</span>
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-yellow-dark bg-yellow-light border border-yellow-border rounded p-3">
                    Updating locked price for {planMembers.length - excludedMemberIds.length} member{planMembers.length - excludedMemberIds.length !== 1 ? "s" : ""}.
                    {excludedMemberIds.length > 0 && ` ${excludedMemberIds.length} excluded member${excludedMemberIds.length !== 1 ? "s" : ""} keep their current price.`}
                    {" "}Members with individual overrides are unaffected. All changes are logged.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setPriceModalPlan(null)} className="flex-1 sm:flex-none text-sm px-4 py-2 border border-line rounded hover:border-black">Cancel</button>
              <button onClick={handlePriceChange} disabled={priceSaving || !newPrice} className="flex-1 sm:flex-none text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50">
                {priceSaving ? "Updating..." : "Update Price"}
              </button>
            </div>
          </div>
        </div>
      )}
      <ErrorToast message={reorderError} />
    </div>
      )}
    </AdminViewTransition>
  );
}
