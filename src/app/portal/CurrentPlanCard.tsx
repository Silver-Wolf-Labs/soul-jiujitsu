"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { selfEnrollInPlan } from "@/lib/actions/portal";
import { requestCancellation } from "@/lib/actions/billing";
import { formatCents, formatDate } from "@/lib/utils";
import Spinner, { SpinnerButton } from "@/components/ui/Spinner";
import {
  HIGHLIGHT_BG_CLASS,
  HIGHLIGHT_TEXT_COLOR,
  HIGHLIGHT_BORDER_HEX,
} from "@/lib/pricing-colors";
import type { MemberMembership, MembershipPlan, MembershipStatus } from "@/lib/supabase/types";

// ── Types ──────────────────────────────────────────────────────────────────

type PlanSummary = Pick<MembershipPlan, "name" | "price_cents" | "billing_interval">;
type ActiveMembership = MemberMembership & { membership_plans: PlanSummary | null };

const MEMBERSHIP_STATUS_COLORS: Record<MembershipStatus, string> = {
  trialing: "bg-blue-light text-blue",
  active:   "bg-success-light text-success",
  paused:   "bg-yellow-light text-yellow-dark",
  canceled: "bg-disabled-light text-muted",
  past_due: "bg-danger-light text-danger",
};

function formatPeriod(plan: MembershipPlan): string {
  if (plan.period_display) return plan.period_display;
  if (plan.billing_interval === "month") return "/month";
  if (plan.billing_interval === "year")  return "/year";
  return "one time";
}

// ── CurrentPlanCard ────────────────────────────────────────────────────────

export default function CurrentPlanCard({
  activeMembership,
  plan,
  effectivePrice,
}: {
  activeMembership: ActiveMembership | null;
  plan: PlanSummary | null;
  effectivePrice: number | null;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ cancelAt: string; chargedAgain: boolean } | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCanceling, startCancelTransition] = useTransition();

  function handleCancel() {
    if (!activeMembership) return;
    setCancelError(null);
    startCancelTransition(async () => {
      const result = await requestCancellation(activeMembership.id);
      if ("error" in result) {
        setCancelError(result.error);
      } else {
        setCancelResult(result);
        router.refresh();
      }
    });
  }

  const isComp = activeMembership?.is_comp ?? false;
  const hasPendingCancel = !!activeMembership?.ends_at;

  return (
    <>
      <div className="bg-white border border-line rounded-lg p-5">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Current Plan</div>
        {plan && activeMembership ? (
          <>
            <div className="font-display text-lg text-black">{plan.name}</div>
            <div className="text-sm text-muted mt-1">
              {effectivePrice !== null ? formatCents(effectivePrice) : "—"} / {plan.billing_interval}
            </div>
            <div className="mt-2">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${MEMBERSHIP_STATUS_COLORS[activeMembership.status]}`}>
                {activeMembership.status}
              </span>
            </div>

            {/* Cancellation UI */}
            {cancelResult ? (
              <div className="mt-3 text-xs text-muted bg-off-white border border-line rounded px-3 py-2">
                Membership cancels on{" "}
                <span className="font-semibold text-ink">
                  {formatDate(cancelResult.cancelAt)}
                </span>
                {cancelResult.chargedAgain && (
                  <span className="block mt-1 text-yellow-dark">You will be charged one more billing cycle.</span>
                )}
              </div>
            ) : hasPendingCancel ? (
              <div className="mt-3 text-xs text-muted">
                Cancels on{" "}
                <span className="font-semibold text-ink">
                  {formatDate(activeMembership.ends_at!)}
                </span>
              </div>
            ) : showCancelConfirm ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted">
                  {isComp
                    ? "This will cancel your complimentary membership immediately."
                    : "Cancellation requires 10 days notice before your next billing date. You may be charged one more billing cycle."}
                </p>
                {cancelError && (
                  <p className="text-xs text-danger">{cancelError}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={isCanceling}
                    className="px-3 py-1 bg-danger text-white text-xs font-semibold rounded hover:brightness-90 transition-all disabled:opacity-50"
                  >
                    {isCanceling ? <SpinnerButton label="Canceling" /> : "Confirm Cancel"}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="text-xs text-muted hover:text-ink transition-colors"
                  >
                    Never mind
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="mt-3 text-xs text-muted hover:text-danger transition-colors underline underline-offset-2"
              >
                Cancel Membership
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted">No active membership</div>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow text-black text-xs font-bold uppercase tracking-wider rounded hover:brightness-95 transition-all"
            >
              Select a Plan
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <PlanSelectionModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

// ── PlanSelectionModal ─────────────────────────────────────────────────────

function PlanSelectionModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function loadPlans() {
      const supabase = createClient();
      const { data } = await supabase
        .from("membership_plans")
        .select("*")
        .eq("status", "active")
        .eq("visible", true)
        .neq("billing_interval", "one_time")
        .order("display_order");
      setPlans(
        (data ?? []).map(p => ({ ...p, features: (p.features as string[]) ?? [] })) as MembershipPlan[]
      );
      setLoading(false);
    }
    loadPlans();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleEnroll(planId: number) {
    setEnrollingId(planId);
    setError(null);
    startTransition(async () => {
      const result = await selfEnrollInPlan(planId);
      if ("error" in result) {
        setError(result.error);
        setEnrollingId(null);
      } else if ("checkoutUrl" in result) {
        // Redirect to Stripe Checkout for paid enrollment
        window.location.href = result.checkoutUrl;
      } else {
        // Trial enrollment — no payment needed
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel: slide-up sheet on mobile, centered modal on desktop */}
      <div className="bg-white w-full flex flex-col rounded-t-2xl max-h-[92dvh] md:rounded-2xl md:max-w-4xl md:max-h-[88vh] md:shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line flex-shrink-0">
          <div>
            <div className="font-display text-xl text-black tracking-tight">Choose a Membership Plan</div>
            <div className="text-xs text-muted mt-0.5">Month-to-month · No contracts · Cancel with 10 days notice</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center text-muted hover:text-ink rounded-full hover:bg-off-white transition-colors flex-shrink-0"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        {/* Plans grid — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 md:p-8">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner label="Loading plans" /></div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted text-center py-12">No plans available. Please contact the gym.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  enrolling={enrollingId === plan.id && isPending}
                  disabled={isPending}
                  onEnroll={() => handleEnroll(plan.id)}
                />
              ))}
            </div>
          )}

          {error && (
            <p className="mt-5 text-sm text-danger bg-danger-light border border-danger-border rounded-lg px-4 py-2.5 text-center">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PlanCard ───────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  enrolling,
  disabled,
  onEnroll,
}: {
  plan: MembershipPlan;
  enrolling: boolean;
  disabled: boolean;
  onEnroll: () => void;
}) {
  const color = plan.highlight_color ?? null;
  const borderStyle = color
    ? { border: `2px solid ${HIGHLIGHT_BORDER_HEX[color]}` }
    : plan.highlight
    ? { border: "2px solid var(--color-ink)" }
    : { border: "1px solid var(--color-line)" };
  const badgeBgClass  = color ? HIGHLIGHT_BG_CLASS[color]   : "bg-black";
  const badgeTextClass = color ? HIGHLIGHT_TEXT_COLOR[color] : "text-white";
  const showBadge = !!(color || plan.highlight);

  return (
    <div
      className="relative flex flex-col bg-white rounded-lg p-6 transition-shadow duration-200 hover:shadow-xl"
      style={borderStyle}
    >
      {showBadge && (
        <div className={`absolute -top-[13px] left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-[0.1em] uppercase px-3.5 py-1 rounded-full whitespace-nowrap ${badgeBgClass} ${badgeTextClass}`}>
          {plan.highlight_label || "Featured"}
        </div>
      )}

      <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-muted mb-4">
        {plan.name}
      </div>
      <div className="font-display text-[48px] leading-none text-ink">
        <sup className="text-xl align-top mt-2">$</sup>
        {Math.floor(plan.price_cents / 100)}
      </div>
      <div className="text-[13px] text-muted mb-5">{formatPeriod(plan)}</div>

      <ul className="flex-1 mb-6 space-y-0">
        {plan.features.map(f => (
          <li key={f} className="text-[13px] text-muted py-2 border-b border-line flex items-start gap-2">
            <span className="text-blue-mid font-bold text-xs mt-0.5 flex-shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={onEnroll}
        disabled={disabled}
        className={`mt-auto w-full py-2.5 rounded text-[12px] font-bold tracking-wider uppercase transition-all duration-150 border ${
          showBadge
            ? "bg-black text-white border-black hover:bg-near-black disabled:opacity-40"
            : "bg-white text-ink border-line hover:border-black hover:bg-black hover:text-white disabled:opacity-40"
        } disabled:cursor-not-allowed`}
      >
        {enrolling ? <SpinnerButton label="Enrolling" /> : "Enroll Now"}
      </button>
    </div>
  );
}
