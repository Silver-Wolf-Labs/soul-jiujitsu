"use client";

// Build marker — bump when Amplify looks stuck on a stale chunk.
// See PROJECT_STATUS.md → "Amplify stale bundle" section for context.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import {
  updateMember,
  deleteMemberWithOptions,
} from "@/lib/actions/members";
import { adminDeleteCheckIn } from "@/lib/actions/check-ins";
import {
  assignMembership,
  cancelMembership,
  forceSetMembershipStatus,
  setMembershipOverridePrice,
} from "@/lib/actions/membership-plans";
import { promoteMember, addStripe, getBeltHistory, updateMemberBeltDetails } from "@/lib/actions/belt-history";
import { type BeltEventType, BELT_EVENT_TYPES, labelForEvent } from "@/lib/belt-events";
import { formatDate, formatDateTime, formatDateTimeTz, formatCents } from "@/lib/utils";
import BeltEditor, { type BeltEditorValue } from "@/components/ui/BeltEditor";
import BeltVisual from "@/components/ui/BeltVisual";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { Member, MemberStatus, MembershipPlan, BeltHistory, CheckInRow } from "@/lib/supabase/types";
import BeltHistoryList from "@/components/member/BeltHistoryList";
import CheckInsList from "@/components/member/CheckInsList";
import MemberBadgesPanel from "@/components/admin/MemberBadgesPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<MemberStatus, string> = {
  active:    "bg-success-light text-success border-success-border",
  trial:     "bg-blue-50 text-blue-700 border-blue-200",
  prospect:  "bg-yellow-light text-yellow-dark border-yellow-border",
  inactive:  "bg-disabled-light text-muted border-line",
  suspended: "bg-danger-light text-danger border-danger-border",
};


const MEMBERSHIP_STATUS_STYLES: Record<string, string> = {
  active:   "bg-success-light text-success border-success-border",
  trialing: "bg-blue-50 text-blue-700 border-blue-200",
  paused:   "bg-yellow-light text-yellow-dark border-yellow-border",
  canceled: "bg-disabled-light text-muted border-line",
  past_due: "bg-danger-light text-danger border-danger-border",
};

interface MembershipRow {
  id: number;
  plan_id: number;
  status: string;
  started_at: string;
  ends_at: string | null;
  canceled_at: string | null;
  locked_price_cents: number;
  override_price_cents: number | null;
  override_note: string | null;
  membership_plans: { name: string; price_cents: number } | null;
}

type FullMember = Member & { member_memberships: MembershipRow[] };

// ── Edit Member Modal ─────────────────────────────────────────────────────────

function EditMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: Member;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    first_name: member.first_name,
    last_name: member.last_name,
    email: member.email,
    phone: member.phone ?? "",
    status: member.status,
    emergency_contact_name: member.emergency_contact_name ?? "",
    emergency_contact_phone: member.emergency_contact_phone ?? "",
    emergency_contact_relationship: member.emergency_contact_relationship ?? "",
    notes: member.notes ?? "",
    communication_opt_in: member.communication_opt_in,
    birth_month: member.birth_month ? String(member.birth_month) : "",
    birth_year: member.birth_year ? String(member.birth_year) : "",
    gender: member.gender ?? "",
    training_started_at: member.training_started_at ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateMember(member.id, {
        ...form,
        phone: form.phone || undefined,
        emergency_contact_name: form.emergency_contact_name || undefined,
        emergency_contact_phone: form.emergency_contact_phone || undefined,
        emergency_contact_relationship: form.emergency_contact_relationship || undefined,
        notes: form.notes || undefined,
        birth_month: form.birth_month ? Number(form.birth_month) : undefined,
        birth_year: form.birth_year ? Number(form.birth_year) : undefined,
        gender: (form.gender || undefined) as "male" | "female" | "other" | "prefer_not_to_say" | undefined,
        training_started_at: form.training_started_at || undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const f = (field: keyof typeof form) => ({
    value: form[field] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value })),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-start justify-center z-50 overflow-y-auto md:px-4 md:py-8">
      <div className="bg-white w-full h-full md:h-auto md:rounded-lg md:max-w-lg md:shadow-xl md:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-line sticky top-0 bg-white">
          <h2 className="font-display text-2xl text-black">Edit Member</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-off-white transition-colors text-muted hover:text-black text-xl leading-none">×</button>
        </div>
        <div className="px-4 sm:px-6 py-5 space-y-4">
          {error && <p className="text-sm text-danger p-3 bg-danger-light border border-danger-border rounded">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">First Name *</label>
              <input type="text" {...f("first_name")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Last Name *</label>
              <input type="text" {...f("last_name")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Email *</label>
              <input type="email" {...f("email")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Phone</label>
              <input type="tel" {...f("phone")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Status</label>
            <select {...f("status")} className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black">
              <option value="prospect">Prospect</option>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <hr className="border-line" />
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Emergency Contact</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Name</label>
              <input type="text" {...f("emergency_contact_name")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Phone</label>
              <input type="tel" {...f("emergency_contact_phone")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-ink mb-1 block">Relationship</label>
            <select {...f("emergency_contact_relationship")} onChange={e => setForm(p => ({...p, emergency_contact_relationship: e.target.value}))} className="w-full border border-line rounded px-3 py-2 text-sm">
              <option value="">Select...</option>
              <option value="spouse">Spouse</option>
              <option value="partner">Partner</option>
              <option value="parent">Parent</option>
              <option value="sibling">Sibling</option>
              <option value="child">Child</option>
              <option value="friend">Friend</option>
              <option value="colleague">Colleague</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Notes</label>
            <textarea {...f("notes")} rows={3} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black resize-none" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.communication_opt_in}
              onChange={e => setForm(prev => ({ ...prev, communication_opt_in: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm text-ink">Opted in to communications</span>
          </label>
          <div className="border-t border-line pt-4 mt-4">
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Demographics & Training</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink mb-1 block">Birth Month</label>
                <select value={form.birth_month} onChange={e => setForm(p => ({...p, birth_month: e.target.value}))} className="w-full border border-line rounded px-3 py-2 text-sm">
                  <option value="">--</option>
                  {Array.from({length: 12}, (_, i) => (
                    <option key={i+1} value={String(i+1)}>{new Date(2000, i).toLocaleString('en-US', {month: 'long'})}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink mb-1 block">Birth Year</label>
                <input type="number" value={form.birth_year} onChange={e => setForm(p => ({...p, birth_year: e.target.value}))} min="1920" max="2020" placeholder="1990" className="w-full border border-line rounded px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs font-medium text-ink mb-1 block">Gender</label>
                <select value={form.gender} onChange={e => setForm(p => ({...p, gender: e.target.value}))} className="w-full border border-line rounded px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink mb-1 block">Training Started</label>
                <input type="date" value={form.training_started_at} onChange={e => setForm(p => ({...p, training_started_at: e.target.value}))} className="w-full border border-line rounded px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-6 py-4 border-t border-line flex justify-end gap-3">
          <button onClick={onClose} className="flex-1 sm:flex-none text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.first_name.trim() || !form.last_name.trim() || !form.email.trim()}
            className="flex-1 sm:flex-none text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Belt Details Modal ────────────────────────────────────────────────────────
//
// "Edit All Details" escape hatch for the Training & Rank card. The quick
// actions (Promote Belt / Add Stripe) cover 90% of cases; this modal exposes
// the same field set the member sees during signup so an admin can correct
// any piece of it — e.g. logging a belt earned before they joined this gym
// or fixing a typo in the training start date.

function BeltDetailsModal({
  member,
  onClose,
  onApplyOptimistic,
  onRollback,
}: {
  member: Member;
  onClose: () => void;
  /** Parent applies the proposed values before the server call finishes.
   *  The modal closes immediately on submit; the parent shows a red inline
   *  error and rolls back via `onRollback` if the server rejects. */
  onApplyOptimistic: (
    next: {
      belt: "white" | "blue" | "purple" | "brown" | "black";
      stripes: number;
      belt_awarded_at: string | null;
      training_started_at: string | null;
      event_type: BeltEventType;
      notes?: string;
    },
    snapshot: {
      belt: "white" | "blue" | "purple" | "brown" | "black";
      stripes: number;
      belt_awarded_at: string | null;
      training_started_at: string | null;
    },
  ) => void;
  onRollback: (err: string) => void;
}) {
  void onRollback; // rollback is invoked by the parent; reserved prop slot.

  // Date inputs work with "YYYY-MM-DD" strings. The DB stores TIMESTAMPTZ, so
  // slice the existing ISO values down to the date portion when seeding.
  const initialBeltAwarded = member.belt_awarded_at
    ? new Date(member.belt_awarded_at).toISOString().slice(0, 10)
    : "";
  const initialTrainingStarted = member.training_started_at
    ? new Date(member.training_started_at).toISOString().slice(0, 10)
    : "";

  const [value, setValue] = useState<BeltEditorValue>({
    belt: member.belt || "white",
    stripes: member.stripes ?? 0,
    beltAwardedAt: initialBeltAwarded,
    trainingStartedAt: initialTrainingStarted,
  });
  const [eventType, setEventType] = useState<BeltEventType>("correction");
  const [notes, setNotes] = useState("");

  function handleSave() {
    // Fire-and-forget: hand everything to the parent, which does the
    // optimistic re-render and the server call. The modal closes
    // immediately so the user isn't stuck watching a spinner.
    onApplyOptimistic(
      {
        belt: value.belt as "white" | "blue" | "purple" | "brown" | "black",
        stripes: value.stripes,
        // Empty date input means "unset / leave alone" on the RPC side
        // (except for white, which nulls regardless). Send null for empty.
        belt_awarded_at: value.beltAwardedAt || null,
        training_started_at: value.trainingStartedAt || null,
        event_type: eventType,
        notes: notes.trim() || undefined,
      },
      {
        belt: (member.belt || "white") as "white" | "blue" | "purple" | "brown" | "black",
        stripes: member.stripes ?? 0,
        belt_awarded_at: member.belt_awarded_at ?? null,
        training_started_at: member.training_started_at ?? null,
      },
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-start justify-center z-50 overflow-y-auto md:px-4 md:py-8">
      <div className="bg-white w-full h-full md:h-auto md:rounded-lg md:max-w-lg md:shadow-xl md:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-line sticky top-0 bg-white">
          <h2 className="font-display text-2xl text-black">Belt Details</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-off-white transition-colors text-muted hover:text-black text-xl leading-none">×</button>
        </div>
        <div className="px-4 sm:px-6 py-5 space-y-5">
          <BeltEditor value={value} onChange={setValue} />

          {/* Event type — flags the change in belt_history so the timeline
              reads correctly. Default is Correction because the quick-action
              buttons already cover straightforward promotions and stripe
              awards; this modal is mostly used for edits. */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Record this change as
            </label>
            <div className="flex rounded border border-line overflow-hidden">
              {BELT_EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEventType(t)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    eventType === t
                      ? "bg-black text-white"
                      : "bg-white text-ink hover:bg-off-white"
                  }`}
                >
                  {labelForEvent(t)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted mt-1">
              Shown on this member&apos;s belt history timeline.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Note</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — why you made this change"
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
            <p className="text-xs text-muted mt-1">Appears in this member&apos;s belt history.</p>
          </div>
        </div>
        <div className="px-4 sm:px-6 py-4 border-t border-line flex justify-end gap-3">
          <button onClick={onClose} className="flex-1 sm:flex-none text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            className="flex-1 sm:flex-none text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Plan Modal ─────────────────────────────────────────────────────────

function AssignPlanModal({
  memberId,
  onClose,
  onSaved,
}: {
  memberId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState("");
  const [isComp, setIsComp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("membership_plans")
      .select("*")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => {
        setPlans((data as MembershipPlan[]) ?? []);
        if (data && data.length > 0) setSelectedPlanId(data[0].id);
      });
  }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  // The plan is Stripe-ready from the DB's perspective when both IDs are
  // present; the server action additionally checks that Stripe is
  // configured at runtime, but we don't know that on the client, so we
  // phrase the hint below as "may send a checkout link".
  const stripeReadyPlan =
    !!selectedPlan?.stripe_product_id && !!selectedPlan?.stripe_default_price_id;

  async function handleAssign() {
    if (!selectedPlanId) return;
    setSaving(true);
    setError(null);
    setCheckoutUrl(null);
    try {
      const result = await assignMembership({
        member_id: memberId,
        plan_id: selectedPlanId,
        started_at: startedAt ? new Date(startedAt).toISOString() : undefined,
        ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
        is_comp: isComp,
      });
      // If Stripe is configured and the plan is synced, the server
      // returned a hosted-checkout URL instead of inserting directly.
      // Surface it so the admin can copy the link to the member.
      if (result?.checkoutUrl) {
        setCheckoutUrl(result.checkoutUrl);
        onSaved();
        return; // keep the modal open so the admin can grab the link
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-start justify-center z-50 overflow-y-auto md:px-4 md:py-8">
      <div className="bg-white w-full h-full md:h-auto md:rounded-lg md:max-w-md md:shadow-xl md:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-line">
          <h2 className="font-display text-2xl text-black">Assign Plan</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-off-white transition-colors text-muted hover:text-black text-xl leading-none">×</button>
        </div>
        <div className="px-4 sm:px-6 py-5 space-y-4">
          {error && <p className="text-sm text-danger p-3 bg-danger-light border border-danger-border rounded">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Plan *</label>
            {plans.length === 0 ? (
              <p className="text-sm text-muted">No active plans found. Create one under Membership Plans first.</p>
            ) : (
              <div className="space-y-2">
                {plans.map(p => (
                  <label key={p.id} className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                    selectedPlanId === p.id ? "border-black bg-off-white" : "border-line hover:border-black/40"
                  }`}>
                    <input
                      type="radio"
                      name="plan"
                      value={p.id}
                      checked={selectedPlanId === p.id}
                      onChange={() => setSelectedPlanId(p.id)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-semibold text-ink">{p.name}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {formatCents(p.price_cents)} / {p.billing_interval}
                        {p.trial_days > 0 && ` · ${p.trial_days}-day trial`}
                        {p.max_classes_per_week && ` · ${p.max_classes_per_week} classes/wk max`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Start Date</label>
              <input
                type="date"
                value={startedAt}
                onChange={e => setStartedAt(e.target.value)}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">End Date (optional)</label>
              <input
                type="date"
                value={endsAt}
                onChange={e => setEndsAt(e.target.value)}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
              />
            </div>
          </div>

          {/* Complimentary toggle — when on, the membership is assigned
              directly at price $0 with no Stripe round-trip. */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer">
            <input
              type="checkbox"
              checked={isComp}
              onChange={(e) => setIsComp(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-black"
            />
            <div>
              <span className="text-sm font-medium text-ink">Complimentary (no charge)</span>
              <p className="text-xs text-muted mt-0.5">
                Assigns the plan at $0. Use for staff, trials, or make-goods.
              </p>
            </div>
          </label>

          {/* What-will-happen hint — mirrors the server branches so the
              admin isn't surprised. */}
          {selectedPlan && (
            <p className="text-xs text-muted bg-off-white border border-line rounded p-3">
              {isComp
                ? "This plan will be assigned immediately at $0."
                : stripeReadyPlan
                  ? "If Stripe is configured, we'll create a checkout link for the member. Otherwise the plan will be assigned directly and you'll collect payment manually."
                  : "This plan isn't linked to Stripe, so it will be assigned directly and you'll collect payment manually."}
            </p>
          )}

          {/* Checkout-link success card — shown when Stripe returns a
              hosted-checkout URL. Admin copies the link to the member. */}
          {checkoutUrl && (
            <div className="p-3 rounded-lg border border-success-border bg-success-light text-sm text-success">
              <p className="font-medium mb-1">Checkout link ready</p>
              <p className="text-xs text-success/80 mb-2">
                Send this link to the member to complete payment:
              </p>
              <input
                type="text"
                readOnly
                value={checkoutUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full text-xs font-mono border border-success-border rounded px-2 py-1 bg-white"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(checkoutUrl)}
                className="mt-2 text-xs text-success underline hover:no-underline"
              >
                Copy to clipboard
              </button>
            </div>
          )}
        </div>
        <div className="px-4 sm:px-6 py-4 border-t border-line flex justify-end gap-3">
          <button onClick={onClose} className="flex-1 sm:flex-none text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
          <button
            onClick={handleAssign}
            disabled={saving || !selectedPlanId || plans.length === 0}
            className="flex-1 sm:flex-none text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
          >
            {saving ? "Assigning…" : "Assign Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Override Price Form ───────────────────────────────────────────────────────

function OverridePriceForm({
  membership,
  onSaved,
}: {
  membership: MembershipRow;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [overrideDollars, setOverrideDollars] = useState(
    membership.override_price_cents != null
      ? (membership.override_price_cents / 100).toFixed(2)
      : ""
  );
  const [note, setNote] = useState(membership.override_note ?? "");
  const [clearing, setClearing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!note.trim()) { setError("A note is required when setting an override price."); return; }
    const cents = Math.round(parseFloat(overrideDollars) * 100);
    if (isNaN(cents) || cents < 0) { setError("Enter a valid price."); return; }
    setSaving(true);
    setError(null);
    try {
      await setMembershipOverridePrice(membership.id, cents, note);
      onSaved();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      await setMembershipOverridePrice(membership.id, null, "");
      onSaved();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setClearing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-mid hover:underline"
      >
        {membership.override_price_cents != null ? "Edit override" : "Set override price"}
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 border border-line rounded space-y-3 bg-off-white">
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Override Price ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={overrideDollars}
            onChange={e => setOverrideDollars(e.target.value)}
            placeholder="e.g. 79.00"
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Note (required)</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Family discount"
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black bg-white"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-3 py-1.5 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save Override"}
        </button>
        {membership.override_price_cents != null && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="text-xs px-3 py-1.5 border border-line rounded hover:border-danger hover:text-danger transition-colors"
          >
            {clearing ? "Clearing…" : "Clear Override"}
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-black ml-auto"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Force Status Form ─────────────────────────────────────────────────────────

function ForceStatusForm({
  membership,
  onSaved,
}: {
  membership: MembershipRow;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(membership.status);
  const [note, setNote] = useState("");
  const [pausedUntil, setPausedUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!note.trim()) { setError("A note is required."); return; }
    setSaving(true);
    setError(null);
    try {
      await forceSetMembershipStatus(
        membership.id,
        status as "active" | "trialing" | "paused" | "past_due" | "canceled",
        note,
        status === "paused" && pausedUntil ? new Date(pausedUntil).toISOString() : null
      );
      onSaved();
      setOpen(false);
      setNote("");
      setPausedUntil("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-muted hover:text-black">
        Force status
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 border border-yellow-border bg-yellow-light rounded space-y-2">
      <p className="text-xs font-semibold text-yellow-dark">Force membership status — logged to audit trail</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">New Status</label>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); if (e.target.value !== "paused") setPausedUntil(""); }}
            className="w-full border border-line rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-black"
          >
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="paused">Paused</option>
            <option value="past_due">Past Due</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Note (required)</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Reason for override"
            className="w-full border border-line rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-black"
          />
        </div>
      </div>
      {status === "paused" && (
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
            Resume Date (optional)
          </label>
          <input
            type="date"
            value={pausedUntil}
            onChange={e => setPausedUntil(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="w-full border border-line rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-black"
          />
          <p className="text-xs text-muted mt-1">Leave blank for indefinite pause.</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-3 py-1.5 bg-yellow-dark text-white rounded hover:bg-yellow-dark disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Force Status"}
        </button>
        <button onClick={() => { setOpen(false); setNote(""); setPausedUntil(""); setError(null); }} className="text-xs text-muted hover:text-black ml-auto">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Delete Member Modal ──────────────────────────────────────────────────────

function DeleteMemberModal({ member, onClose, onDeleted }: {
  member: Member;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [preserveWaivers, setPreserveWaivers] = useState(true); // default: preserve
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMemberWithOptions(member.id, { preserveWaivers });
      onDeleted();
    } catch {
      setDeleting(false);
    }
  }

  // Strict case-sensitive match — must be exactly "DELETE". Raising the
  // bar on keystrokes makes accidental confirmation much less likely.
  const canDelete = confirmText === "DELETE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-display text-danger mb-2">Delete Member</h3>
        <p className="text-sm text-muted mb-4">
          This will permanently delete <strong>{member.first_name} {member.last_name}</strong> and all associated data (memberships, check-ins, purchases).
        </p>

        {/* Waiver preservation option */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-line bg-off-white mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={preserveWaivers}
            onChange={e => setPreserveWaivers(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded accent-black"
          />
          <div>
            <span className="text-sm font-medium text-ink">Preserve waiver signatures</span>
            <p className="text-xs text-muted mt-0.5">
              Archive signed waivers for legal compliance. The signed documents and signatures will be kept even after the member is deleted.
            </p>
          </div>
        </label>

        {/* Confirmation input */}
        <div className="mb-4">
          <label className="block text-xs text-muted mb-1">
            Type <strong>DELETE</strong> (all caps) to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger font-mono tracking-wider"
            placeholder="DELETE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 text-sm px-4 py-2 border border-line rounded hover:bg-off-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex-1 text-sm px-4 py-2 bg-danger text-white rounded hover:bg-danger/90 disabled:opacity-40 transition-colors"
          >
            {deleting ? "Deleting..." : "Delete Member"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [member, setMember] = useState<FullMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeWaiverVersion, setActiveWaiverVersion] = useState<number | null>(null);
  const [memberWaiverVersion, setMemberWaiverVersion] = useState<number | null>(null);
  const [checkInCount, setCheckInCount] = useState(0);
  const [recentCheckIns, setRecentCheckIns] = useState<CheckInRow[]>([]);

  const [beltHistory, setBeltHistory] = useState<BeltHistory[]>([]);
  const [promoting, setPromoting] = useState(false);
  const [addingStripe, setAddingStripe] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [beltEditOpen, setBeltEditOpen] = useState(false);
  const [beltEditError, setBeltEditError] = useState<string | null>(null);
  // Pending confirmation dialogs for the Promote / Award stripe quick
  // actions. Payloads carry everything the modal needs to render; the
  // actual server action runs inside the ConfirmModal's onConfirm.
  const [promoteConfirm, setPromoteConfirm] = useState<{ from: string; to: string } | null>(null);
  const [stripeConfirm, setStripeConfirm] = useState<{ to: number; belt: string } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  // Confirm-before-delete for individual check-in rows.
  const [checkInDeleteId, setCheckInDeleteId] = useState<number | null>(null);
  const [checkInDeleteError, setCheckInDeleteError] = useState<string | null>(null);
  // Confirm-before-cancel for membership rows.
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null);

  // Optimistic belt-details apply. The modal closes immediately; the parent
  // flips the Training & Rank card to the new values and fires the server
  // call. On success we reload to pick up the canonical belt_history row.
  // On failure we restore the snapshot and surface the error inline.
  async function handleApplyBeltDetails(
    next: {
      belt: "white" | "blue" | "purple" | "brown" | "black";
      stripes: number;
      belt_awarded_at: string | null;
      training_started_at: string | null;
      event_type: BeltEventType;
      notes?: string;
    },
    snapshot: {
      belt: "white" | "blue" | "purple" | "brown" | "black";
      stripes: number;
      belt_awarded_at: string | null;
      training_started_at: string | null;
    },
  ) {
    if (!member) return;
    setBeltEditError(null);

    // Optimistically patch the member object so the Training & Rank card
    // re-renders with the new values before the server responds.
    setMember({
      ...member,
      belt: next.belt,
      stripes: next.stripes,
      belt_awarded_at: next.belt === "white" ? null : next.belt_awarded_at,
      training_started_at: next.training_started_at,
    });

    // Optimistically prepend a pending belt_history row so the timeline
    // reacts instantly. Negative synthetic id so a subsequent refetch
    // replaces it without keying collision. On error we strip it below.
    const optimisticId = -Date.now();
    const optimisticRow: BeltHistory = {
      id: optimisticId,
      member_id: member.id,
      belt: next.belt,
      stripes: next.stripes,
      event_type: next.event_type,
      notes: next.notes ?? null,
      promoted_by: null,
      promoted_by_name: null,
      promoted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const priorHistory = beltHistory;
    setBeltHistory([optimisticRow, ...beltHistory]);

    try {
      await updateMemberBeltDetails(member.id, next);
      // Refetch belt history directly (don't depend on load() not erroring
      // upstream). The server action has returned, so the new canonical
      // row exists in the DB and this replaces the optimistic entry with
      // the real one including promoted_by_name and the DB-assigned id.
      try {
        const history = await getBeltHistory(member.id);
        setBeltHistory(history);
      } catch (histErr) {
        // Keep the optimistic row visible and surface the refresh failure
        // so the admin knows the server succeeded but the refresh didn't.
        console.error("[MemberDetailPage] belt history refetch failed", histErr);
        setBeltEditError(
          "Saved, but couldn't refresh the belt history. Reload the page to see the latest entries.",
        );
      }
      // Also trigger a full reload so every other data bucket (member
      // row, check-ins, etc.) stays in sync.
      await load();
    } catch (e) {
      // Roll back: restore the prior values on the already-visible card
      // AND remove the optimistic history row so the timeline doesn't
      // keep a phantom entry around.
      setMember({
        ...member,
        belt: snapshot.belt,
        stripes: snapshot.stripes,
        belt_awarded_at: snapshot.belt_awarded_at,
        training_started_at: snapshot.training_started_at,
      });
      setBeltHistory(priorHistory);
      setBeltEditError(
        e instanceof Error ? e.message : "Couldn't save belt details. Please try again.",
      );
    }
  }

  // Admin-side check-in removal. Opens a ConfirmModal (setCheckInDeleteId),
  // then executes optimistically on confirmation. Rolls back and shows an
  // inline error banner if the server call fails.
  async function executeDeleteCheckIn() {
    const checkInId = checkInDeleteId;
    if (!checkInId) return;
    const prev = recentCheckIns;
    const prevCount = checkInCount;
    setCheckInDeleteId(null);
    setCheckInDeleteError(null);
    setRecentCheckIns(prev.filter(ci => ci.id !== checkInId));
    setCheckInCount(Math.max(0, prevCount - 1));
    try {
      await adminDeleteCheckIn(checkInId);
    } catch (err) {
      setRecentCheckIns(prev);
      setCheckInCount(prevCount);
      setCheckInDeleteError(err instanceof Error ? err.message : "Failed to delete check-in");
    }
  }

  async function load() {
    const supabase = createClient();
    const [{ data, error }, { data: activeTemplate }, { data: memberSig }, { count }, { data: recent }] = await Promise.all([
      supabase
        .from("members")
        .select(`*, member_memberships(*, membership_plans(name, price_cents))`)
        .eq("id", id)
        .single(),
      supabase
        .from("waiver_templates")
        .select("version")
        .eq("active", true)
        .single(),
      supabase
        .from("waiver_signatures")
        .select("template_version")
        .eq("member_id", id)
        .order("signed_at", { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .eq("member_id", id),
      supabase
        .from("check_ins")
        .select("id, class_name, class_date, checked_in_at, source")
        .eq("member_id", id)
        .order("class_date", { ascending: false })
        // Upper bound for the expanded "Show more" view. Members with
        // more history than this can still see the running total in
        // Quick Stats; we just cap what the page renders at once so
        // this card doesn't grow without limit.
        .limit(50),
    ]);

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setMember(data as FullMember);
    setActiveWaiverVersion(activeTemplate?.version ?? null);
    setMemberWaiverVersion(memberSig?.template_version ?? null);
    setCheckInCount(count ?? 0);
    setRecentCheckIns(recent ?? []);
    setLoading(false);

    // After the main member load, fetch belt history. Log instead of
    // silently swallowing — the table has existed for a while now, so a
    // failure here is a real bug, not an expected pre-migration state.
    try {
      const history = await getBeltHistory(id);
      setBeltHistory(history);
    } catch (e) {
      console.error("[MemberDetailPage] getBeltHistory failed", e);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  function handleDeleteCompleted() {
    router.push("/admin/members");
  }

  function handlePromote() {
    if (!member) return;
    const currentBelt = member.belt || "white";
    const BELT_ORDER = ["white", "blue", "purple", "brown", "black"];
    const nextIdx = BELT_ORDER.indexOf(currentBelt) + 1;
    if (nextIdx >= BELT_ORDER.length) return;
    const nextBelt = BELT_ORDER[nextIdx];
    // Open the styled confirm modal; the server call runs from onConfirm.
    setPromoteConfirm({ from: currentBelt, to: nextBelt });
  }

  async function confirmPromote() {
    if (!member || !promoteConfirm) return;
    setPromoting(true);
    setBeltEditError(null);
    try {
      await promoteMember(member.id);
      await load();
      setPromoteConfirm(null);
    } catch (e) {
      // Surface via the same inline banner the optimistic edit uses, so
      // admin errors all show up in one place above the card.
      setBeltEditError(e instanceof Error ? e.message : "Failed to promote");
      setPromoteConfirm(null);
    } finally {
      setPromoting(false);
    }
  }

  function handleAddStripe() {
    if (!member) return;
    const currentBelt = member.belt || "white";
    const maxStripes = currentBelt === "black" ? 6 : 4;
    const current = member.stripes ?? 0;
    if (current >= maxStripes) return;
    setStripeConfirm({ to: current + 1, belt: currentBelt });
  }

  async function confirmAddStripe() {
    if (!member || !stripeConfirm) return;
    setAddingStripe(true);
    setBeltEditError(null);
    try {
      await addStripe(member.id);
      await load();
      setStripeConfirm(null);
    } catch (e) {
      setBeltEditError(e instanceof Error ? e.message : "Failed to add stripe");
      setStripeConfirm(null);
    } finally {
      setAddingStripe(false);
    }
  }

  async function executeCancelMembership() {
    const membershipId = cancelConfirmId;
    if (!membershipId) return;
    setCancelConfirmId(null);
    setCancelingId(membershipId);
    try {
      await cancelMembership(membershipId);
      await load();
    } finally {
      setCancelingId(null);
    }
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><Spinner label="Loading" /></div>;
  }

  if (notFound || !member) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted mb-3">Member not found.</p>
        <button onClick={() => router.push("/admin/members")} className="text-sm text-blue-mid hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />Back to Members</button>
      </div>
    );
  }

  const activeMemberships = member.member_memberships.filter(
    m => m.status === "active" || m.status === "trialing" || m.status === "paused"
  );
  const pastMemberships = member.member_memberships.filter(
    m => m.status === "canceled" || m.status === "past_due"
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin/members")} className="text-sm text-muted hover:text-black shrink-0 inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />Back</button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl sm:text-4xl text-black">
                {member.first_name} {member.last_name}
              </h1>
              <span className={`text-xs px-2 py-0.5 rounded border capitalize shrink-0 ${STATUS_STYLES[member.status]}`}>
                {member.status}
              </span>
            </div>
            <p className="text-sm text-muted mt-0.5">Member #{member.id} · Joined {formatDate(member.created_at)}</p>
          </div>
        </div>
        {/* Page actions — Edit is primary; Delete sits alongside so it's
            always reachable without scrolling to a Danger Zone footer. The
            confirmation modal (type-DELETE) protects against accidents. */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditOpen(true)}
            className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="text-sm px-4 py-2 border border-danger-border text-danger rounded hover:bg-danger-light transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Flat grid — 1-col on mobile, 3-col at xl+. Each section declares its
          own xl:order-N so the visual desktop layout differs from DOM order.
          DOM order is optimised for mobile (most important first). */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Training & Rank — first on mobile, Row 1 Col 3 on desktop */}
        <section className="bg-white border border-line rounded-lg p-5 xl:order-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Training & Rank</h2>
          </div>

          {/* Inline error banner — shown when an optimistic save was
              rolled back. Lives above the belt display so the admin sees
              the cause and the (restored) state together. */}
          {beltEditError && (
            <div className="mb-3 flex items-start gap-2 p-2.5 rounded border border-danger-border bg-danger-light text-xs text-danger">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Couldn&apos;t save belt details</p>
                <p className="text-danger/80">{beltEditError}</p>
              </div>
              <button
                type="button"
                onClick={() => setBeltEditError(null)}
                className="text-danger hover:text-black text-sm leading-none -mt-0.5"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {/* Belt display — mirrors the member-portal `CURRENT RANK`
              visualization so the admin sees exactly what the member sees,
              and so the live preview inside Edit Belt Details is a direct
              match for this panel. */}
          <div className="mb-4">
            <BeltVisual
              belt={member.belt || "white"}
              stripes={member.stripes ?? 0}
              className="w-full max-w-xs"
            />
            <div className="mt-2 text-sm text-ink">
              <span className="capitalize font-semibold">{member.belt || "white"}</span> belt
              {(member.stripes ?? 0) > 0 && (
                <span className="text-muted"> &middot; {member.stripes} {(member.stripes ?? 0) === 1 ? "stripe" : "stripes"}</span>
              )}
            </div>
          </div>

          {/* Training info — belt_awarded_at rows are hidden for white
              belt (there's no awarding event to reference). */}
          <div className="text-xs space-y-1 text-muted mb-4">
            {member.training_started_at && (
              <div>Training since: <span className="text-ink">{formatDate(member.training_started_at)}</span></div>
            )}
            {member.belt_awarded_at && member.belt !== "white" && (
              <div>Current belt since: <span className="text-ink">{formatDate(member.belt_awarded_at)}</span></div>
            )}
            {member.belt_awarded_at && member.belt !== "white" && (
              <div>Time at current belt: <span className="text-ink">{
                (() => {
                  const days = Math.floor((Date.now() - new Date(member.belt_awarded_at).getTime()) / 86400000);
                  if (days < 30) return `${days} days`;
                  const months = Math.floor(days / 30);
                  return months < 12 ? `${months} months` : `${Math.floor(months / 12)}y ${months % 12}m`;
                })()
              }</span></div>
            )}
          </div>

          {/* Action buttons — quick actions on top row, full-edit escape
              hatch on the second row. Quick actions always render but
              gray out at their natural ceilings (black belt / 4 stripes)
              so the admin always sees the full set and understands why
              a button is unavailable. The bottom button is there for
              corrections, backdated belts, or anything the quick
              actions can't express. */}
          {(() => {
            const currentBelt = member.belt || "white";
            const currentStripes = member.stripes ?? 0;
            const atBlackBelt = currentBelt === "black";
            // Black belts earn up to 6 degrees; colored belts cap at 4.
            const maxStripes = atBlackBelt ? 6 : 4;
            const atMaxStripes = currentStripes >= maxStripes;
            const promoteDisabled = promoting || atBlackBelt;
            const stripeDisabled  = addingStripe || atMaxStripes;
            // Tooltip for the stripe ceiling differs by belt — black has
            // no next-belt-reset story, so we phrase it as a hard cap.
            const stripeCapTooltip = atMaxStripes
              ? atBlackBelt
                ? `Already at 6 stripes on black belt — the highest degree.`
                : `Already at 4 stripes on ${currentBelt} belt — promote the belt to reset to 0.`
              : undefined;
            return (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={handlePromote}
                    disabled={promoteDisabled}
                    title={atBlackBelt ? "Already at black belt — the highest rank." : undefined}
                    className="flex-1 text-xs px-3 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {promoting ? "Promoting\u2026" : "Promote to next belt"}
                  </button>
                  <button
                    onClick={handleAddStripe}
                    disabled={stripeDisabled}
                    title={stripeCapTooltip}
                    className="flex-1 text-xs px-3 py-2 border border-line rounded hover:bg-off-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {addingStripe ? "Adding\u2026" : "Award stripe"}
                  </button>
                </div>
                <button
                  onClick={() => setBeltEditOpen(true)}
                  className="w-full text-xs px-3 py-2 border border-line rounded hover:border-black transition-colors font-medium text-ink"
                >
                  Edit all Training and Rank details
                </button>
              </div>
            );
          })()}
        </section>

        {/* Quick Stats — second on mobile, Row 3 Col 1 on desktop */}
        <section className="bg-white border border-line rounded-lg p-5 xl:order-7">
          <h2 className="text-sm font-semibold text-ink mb-3">Quick Stats</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Active plans</dt>
              <dd className="font-medium text-ink">{activeMemberships.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Past plans</dt>
              <dd className="font-medium text-ink">{pastMemberships.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Member since</dt>
              <dd className="font-medium text-ink">{formatDate(member.created_at)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 mt-2">
              <dt className="text-muted">Total check-ins</dt>
              <dd className="font-medium text-ink">{checkInCount}</dd>
            </div>
          </dl>
        </section>

        {/* Memberships — third on mobile, Row 1 Col 2 on desktop */}
        <section className="bg-white border border-line rounded-lg p-5 xl:order-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink">Memberships</h2>
            <button
              onClick={() => setAssignOpen(true)}
              className="text-xs px-3 py-1.5 bg-black text-white rounded hover:bg-near-black transition-colors"
            >
              + Assign Plan
            </button>
          </div>

          {activeMemberships.length === 0 && pastMemberships.length === 0 && (
            <p className="text-sm text-muted py-4 text-center">No memberships yet.</p>
          )}

          {activeMemberships.length > 0 && (
            <div className="space-y-3 mb-4">
              {activeMemberships.map(m => {
                const effectivePrice = m.override_price_cents ?? m.locked_price_cents;
                const hasOverride = m.override_price_cents != null;
                return (
                  <div key={m.id} className="border border-line rounded-lg p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {m.membership_plans?.name ?? `Plan #${m.plan_id}`}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded border capitalize ${MEMBERSHIP_STATUS_STYLES[m.status] ?? ""}`}>
                            {m.status}
                          </span>
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          <p className="text-xs text-muted">
                            Started {formatDate(m.started_at)}
                            {m.ends_at && ` · Ends ${formatDate(m.ends_at)}`}
                          </p>
                          <p className="text-xs text-muted">
                            Locked price: {formatCents(m.locked_price_cents)}
                            {hasOverride && (
                              <span className="ml-2 text-yellow-dark">
                                Override: {formatCents(effectivePrice)}
                                {m.override_note && ` — ${m.override_note}`}
                              </span>
                            )}
                          </p>
                          <p className="text-xs font-semibold text-ink">
                            Effective: {formatCents(effectivePrice)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setCancelConfirmId(m.id)}
                        disabled={cancelingId === m.id}
                        className="text-xs text-danger hover:underline shrink-0 disabled:opacity-50"
                      >
                        {cancelingId === m.id ? "Canceling…" : "Cancel"}
                      </button>
                    </div>
                    <div className="mt-2 pt-2 border-t border-line flex flex-wrap gap-2">
                      <OverridePriceForm membership={m} onSaved={load} />
                      <ForceStatusForm membership={m} onSaved={load} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pastMemberships.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 mt-4">Past Memberships</p>
              <div className="space-y-2">
                {pastMemberships.map(m => (
                  <div key={m.id} className="border border-line rounded p-3 opacity-60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-ink">
                        {m.membership_plans?.name ?? `Plan #${m.plan_id}`}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded border capitalize ${MEMBERSHIP_STATUS_STYLES[m.status] ?? ""}`}>
                        {m.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {formatDate(m.started_at)} — {m.canceled_at ? formatDate(m.canceled_at) : "—"}
                      {" "}· {formatCents(m.locked_price_cents)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Contact Info — fourth on mobile, Row 1 Col 1 on desktop */}
        <section className="bg-white border border-line rounded-lg p-5 xl:order-1">
          <h2 className="text-sm font-semibold text-ink mb-4">Contact Information</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-muted uppercase tracking-wide mb-0.5">Email</dt>
              <dd className="text-ink">{member.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted uppercase tracking-wide mb-0.5">Phone</dt>
              <dd className="text-ink">{member.phone ?? <span className="text-muted">—</span>}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted uppercase tracking-wide mb-0.5">Emergency Contact</dt>
              <dd className="text-ink">
                {member.emergency_contact_name
                  ? `${member.emergency_contact_name}${member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ""}`
                  : <span className="text-muted">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted uppercase tracking-wide mb-0.5">Communications</dt>
              <dd className={member.communication_opt_in ? "text-success" : "text-muted"}>
                {member.communication_opt_in ? "Opted in" : "Opted out"}
              </dd>
            </div>
          </dl>
          {member.notes && (
            <div className="mt-4 pt-4 border-t border-line">
              <dt className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Notes</dt>
              <p className="text-sm text-ink whitespace-pre-wrap">{member.notes}</p>
            </div>
          )}
        </section>

        {/* Recent Check-ins — fifth on mobile, Row 2 Col 2 on desktop */}
        <section className="bg-white border border-line rounded-lg p-5 xl:order-5">
          <h2 className="text-sm font-semibold text-ink mb-3">Recent Check-ins</h2>
          {checkInDeleteError && (
            <p className="mb-3 text-xs text-danger bg-danger-light border border-danger-border rounded px-3 py-2">
              {checkInDeleteError}
              <button
                onClick={() => setCheckInDeleteError(null)}
                className="ml-2 underline"
              >
                Dismiss
              </button>
            </p>
          )}
          <CheckInsList
            checkIns={recentCheckIns}
            onDelete={id => setCheckInDeleteId(id)}
            totalLifetime={checkInCount}
            rowCap={50}
            emptyText="No check-ins recorded yet."
          />
        </section>

        {/* Belt History — sixth on mobile, Row 2 Col 3 on desktop */}
        {beltHistory.length > 0 && (
          <section className="bg-white border border-line rounded-lg p-5 xl:order-6">
            <h2 className="text-sm font-semibold text-ink mb-3">Belt History</h2>
            <BeltHistoryList entries={beltHistory} />
          </section>
        )}

        {/* Badges — sits next to Belt History because both are recognition the
            profe hands out, and they'll be reached for in the same moment. */}
        <div className="xl:order-7">
          <MemberBadgesPanel memberId={member.id} />
        </div>

        {/* Waiver — seventh on mobile, Row 2 Col 1 on desktop */}
        <section className="bg-white border border-line rounded-lg p-5 xl:order-4">
          <h2 className="text-sm font-semibold text-ink mb-3">Waiver</h2>
          {(() => {
            const isOutdated =
              member.waiver_signed_at &&
              activeWaiverVersion !== null &&
              memberWaiverVersion !== null &&
              memberWaiverVersion < activeWaiverVersion;
            if (!member.waiver_signed_at) {
              return (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow" />
                  <p className="text-sm text-yellow-dark font-medium">Not yet signed</p>
                </div>
              );
            }
            if (isOutdated) {
              return (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-orange" />
                    <div>
                      <p className="text-sm text-orange font-medium">Outdated version</p>
                      <p className="text-xs text-muted">
                        Signed v{memberWaiverVersion} · Current v{activeWaiverVersion}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted">Signed {formatDateTime(member.waiver_signed_at)}</p>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-success" />
                <div>
                  <p className="text-sm text-success font-medium">
                    Signed {activeWaiverVersion && memberWaiverVersion ? `(v${memberWaiverVersion})` : ""}
                  </p>
                  <p className="text-xs text-muted">{formatDateTime(member.waiver_signed_at)}</p>
                </div>
              </div>
            );
          })()}
        </section>

      </div>

      {/* Modals */}
      {editOpen && (
        <EditMemberModal
          member={member}
          onClose={() => setEditOpen(false)}
          onSaved={load}
        />
      )}
      {beltEditOpen && (
        <BeltDetailsModal
          member={member}
          onClose={() => setBeltEditOpen(false)}
          onApplyOptimistic={handleApplyBeltDetails}
          onRollback={setBeltEditError}
        />
      )}
      {promoteConfirm && (
        <ConfirmModal
          title="Promote to next belt?"
          body={
            <p>
              Promote <strong className="text-ink">{member.first_name} {member.last_name}</strong>
              {" from "}<span className="capitalize text-ink">{promoteConfirm.from}</span> belt
              {" to "}<span className="capitalize text-ink">{promoteConfirm.to}</span> belt.
              Stripes will reset to 0 and a new entry will be added to their belt history.
            </p>
          }
          confirmLabel="Promote"
          confirmBusyLabel="Promoting\u2026"
          onConfirm={confirmPromote}
          onCancel={() => setPromoteConfirm(null)}
        />
      )}
      {stripeConfirm && (
        <ConfirmModal
          title="Award stripe?"
          body={
            <p>
              Award stripe <strong className="text-ink">{stripeConfirm.to}</strong>
              {" on "}<span className="capitalize text-ink">{stripeConfirm.belt}</span> belt
              {" to "}<strong className="text-ink">{member.first_name} {member.last_name}</strong>.
              A new entry will be added to their belt history.
            </p>
          }
          confirmLabel="Award stripe"
          confirmBusyLabel="Awarding\u2026"
          onConfirm={confirmAddStripe}
          onCancel={() => setStripeConfirm(null)}
        />
      )}
      {assignOpen && (
        <AssignPlanModal
          memberId={member.id}
          onClose={() => setAssignOpen(false)}
          onSaved={load}
        />
      )}
      {deleteOpen && (
        <DeleteMemberModal
          member={member}
          onClose={() => setDeleteOpen(false)}
          onDeleted={handleDeleteCompleted}
        />
      )}
      {checkInDeleteId !== null && (
        <ConfirmModal
          title="Delete check-in?"
          body={<p>This check-in will be permanently removed. This action is audit-logged and cannot be undone.</p>}
          confirmLabel="Delete"
          confirmBusyLabel="Deleting\u2026"
          onConfirm={executeDeleteCheckIn}
          onCancel={() => setCheckInDeleteId(null)}
        />
      )}
      {cancelConfirmId !== null && (
        <ConfirmModal
          title="Cancel membership?"
          body={<p>This will mark the membership as canceled. The member can be re-enrolled at any time.</p>}
          confirmLabel="Cancel membership"
          confirmBusyLabel="Canceling\u2026"
          onConfirm={executeCancelMembership}
          onCancel={() => setCancelConfirmId(null)}
        />
      )}
    </div>
  );
}
