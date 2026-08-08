"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { selfEnrollInPlan } from "@/lib/actions/portal";
import { requestCancellation } from "@/lib/actions/billing";
import { formatColones, formatColonesWithSign } from "@/lib/currency";
import { formatDate } from "@/lib/utils";
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

/**
 * The price suffix under a plan's number.
 *
 * `period_display` wins when set: it is a free-text column the admin fills in when
 * a plan needs wording the three fixed intervals can't express ("por trimestre"),
 * so it is the profe's copy and renders verbatim. Only the fallbacks are the
 * system talking, and they come from the catalogue — hence the `t` parameter,
 * since this is a plain function and can't call the hook.
 */
function formatPeriod(
  plan: MembershipPlan,
  t: (key: string) => string
): string {
  if (plan.period_display) return plan.period_display;
  if (plan.billing_interval === "month") return t("perMonth");
  if (plan.billing_interval === "year")  return t("perYear");
  return t("oneTime");
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
  const t = useTranslations("portal.plan");
  const tInterval = useTranslations("portal.billingInterval");
  const tStatus = useTranslations("portal.membershipStatus");
  const [showModal, setShowModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ cancelAt: string } | null>(null);
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
      <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t("heading")}</div>
        {plan && activeMembership ? (
          <>
            {/* Plan name as the admin wrote it. */}
            <div className="font-display text-lg text-black dark:text-ink">{plan.name}</div>
            <div className="text-sm text-muted mt-1">
              {/* The interval was the raw enum ("month") beside a Spanish price.
                  Both halves go through the message now. */}
              {t("perInterval", {
                price: effectivePrice !== null ? formatColonesWithSign(effectivePrice) : "—",
                interval: tInterval(plan.billing_interval),
              })}
            </div>
            <div className="mt-2">
              {/* `capitalize` gone with the raw enum — see the same badge in the
                  profile page's billing tab. */}
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${MEMBERSHIP_STATUS_COLORS[activeMembership.status]}`}>
                {tStatus(activeMembership.status)}
              </span>
            </div>

            {/* Where the "manage payment method" link used to be. A member on a
                paid plan needs to know the money is handled in person, not that
                nothing exists here — comped members are excluded because there
                is nothing for them to pay. */}
            {!isComp && (
              <p className="mt-3 text-xs text-muted">{t("payAtGym")}</p>
            )}

            {/* Cancellation UI */}
            {cancelResult ? (
              <div className="mt-3 text-xs text-muted bg-off-white border border-line rounded px-3 py-2">
                {/* t.rich, not a bare interpolation: the date keeps its bold span,
                    and in Spanish it sits mid-sentence rather than at the end. */}
                {t.rich("cancelScheduled", {
                  date: formatDate(cancelResult.cancelAt),
                  b: (chunks) => <span className="font-semibold text-ink">{chunks}</span>,
                })}
              </div>
            ) : hasPendingCancel ? (
              <div className="mt-3 text-xs text-muted">
                {t.rich("cancelsOn", {
                  date: formatDate(activeMembership.ends_at!),
                  b: (chunks) => <span className="font-semibold text-ink">{chunks}</span>,
                })}
              </div>
            ) : showCancelConfirm ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted">
                  {isComp ? t("confirmCompCopy") : t("confirmPaidCopy")}
                </p>
                {cancelError && (
                  <p className="text-xs text-danger">{cancelError}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={isCanceling}
                    // dark:text-black, not text-white: `danger` inverts to a light
                    // red tint on dark, so white-on-danger measures 1.9:1 there.
                    // Black on that same tint is 11:1.
                    className="px-3 py-1 bg-danger text-white dark:text-black text-xs font-semibold rounded hover:brightness-90 transition-all disabled:opacity-50"
                  >
                    {isCanceling ? <SpinnerButton label={t("canceling")} /> : t("confirmCancel")}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="text-xs text-muted hover:text-ink transition-colors"
                  >
                    {t("neverMind")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="mt-3 text-xs text-muted hover:text-danger transition-colors underline underline-offset-2"
              >
                {t("cancelMembership")}
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted">{t("noneActive")}</div>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow text-black text-xs font-bold uppercase tracking-wider rounded hover:brightness-95 transition-all"
            >
              {t("selectPlan")}
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
  const t = useTranslations("portal.plan");
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
      } else {
        // Trial enrollment is the only self-serve path — paid plans are
        // arranged with the profe, and the server rejects them.
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
      <div className="bg-white dark:bg-portal-card w-full flex flex-col rounded-t-2xl max-h-[92dvh] md:rounded-2xl md:max-w-4xl md:max-h-[88vh] md:shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line flex-shrink-0">
          <div>
            <div className="font-display text-xl text-black dark:text-ink tracking-tight">{t("modalTitle")}</div>
            <div className="text-xs text-muted mt-0.5">{t("modalSubtitle")}</div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
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
            <div className="flex justify-center py-12"><Spinner label={t("loadingPlans")} /></div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted text-center py-12">{t("noPlans")}</p>
          ) : (
            <>
              {/* Sets expectations before the member clicks: only trial plans
                  activate from here. Without this the paid cards look broken
                  rather than intentionally staffed. */}
              <p className="mb-4 text-xs text-muted bg-off-white border border-line rounded-lg px-4 py-2.5">
                {t("trialOnlyNote")}
              </p>
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
            </>
          )}

          {/* Already Spanish — selfEnrollInPlan resolves its own copy from
              portal.errors. */}
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
  const t = useTranslations("portal.plan");
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
      className="relative flex flex-col bg-white dark:bg-portal-card rounded-lg p-6 transition-shadow duration-200 hover:shadow-xl"
      style={borderStyle}
    >
      {showBadge && (
        <div className={`absolute -top-[13px] left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-[0.1em] uppercase px-3.5 py-1 rounded-full whitespace-nowrap ${badgeBgClass} ${badgeTextClass}`}>
          {/* highlight_label is the admin's ribbon text ("Más popular"); only the
              fallback for a highlighted plan with no label set is ours. */}
          {plan.highlight_label || t("featured")}
        </div>
      )}

      {/* Plan name and features: all admin-authored, rendered as stored. */}
      <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-muted mb-4">
        {plan.name}
      </div>
      <div className="font-display text-[48px] leading-none text-ink">
        {/* The sign stays a separate <sup> so it doesn't scale with the 48px
            number — hence formatColones (bare digits) rather than the
            with-sign variant. */}
        <sup className="text-xl align-top mt-2">₡</sup>
        {formatColones(plan.price_cents)}
      </div>
      <div className="text-[13px] text-muted mb-5">{formatPeriod(plan, t)}</div>

      <ul className="flex-1 mb-6 space-y-0">
        {plan.features.map(f => (
          <li key={f} className="text-[13px] text-muted py-2 border-b border-line flex items-start gap-2">
            <span className="text-blue-mid font-bold text-xs mt-0.5 flex-shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>

      {/* A trial is the only plan this button can actually activate — the server
          action rejects paid ones, because nothing here can take the money. So a
          paid card gets the in-person instruction instead of a button that is
          guaranteed to fail on click. */}
      {plan.trial_days > 0 ? (
        <button
          onClick={onEnroll}
          disabled={disabled}
          className={`mt-auto w-full py-2.5 rounded text-[12px] font-bold tracking-wider uppercase transition-all duration-150 border ${
            showBadge
              ? "bg-black text-white dark:bg-yellow dark:text-black border-black dark:border-yellow hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-40"
              // The hover state needs its own dark triplet: hovering to
              // black-on-black would blank the button out on a dark card.
              : "bg-white dark:bg-portal-card text-ink border-line hover:border-black hover:bg-black hover:text-white dark:hover:border-yellow dark:hover:bg-yellow dark:hover:text-black disabled:opacity-40"
          } disabled:cursor-not-allowed`}
        >
          {enrolling ? <SpinnerButton label={t("enrolling")} /> : t("enrollTrial")}
        </button>
      ) : (
        <p className="mt-auto text-center text-[12px] text-muted border-t border-line pt-3">
          {t("payAtGym")}
        </p>
      )}
    </div>
  );
}
