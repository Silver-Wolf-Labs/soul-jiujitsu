"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { BadgeMedal } from "@/components/member/BadgeMedal";
import BadgeTracker from "@/components/member/BadgeTracker";
import { getOwnTrackedBadge, getTrackableBadges, setOwnTrackedBadge } from "@/lib/actions/portal";
import type { TrackedBadgeState } from "@/lib/badge-progress";
import type { Badge } from "@/lib/supabase/types";

/**
 * The portal's tracker: the shared BadgeTracker plus the controls to pick, change
 * and clear the goal.
 *
 * The picker's catalogue is fetched when the modal opens rather than
 * server-rendered with the page. It is a list only ever seen by a member who taps
 * "Elegir objetivo", and paying ~30 rows on every portal load — including the
 * majority of loads that never open it — to save a spinner on the minority that
 * do is the wrong trade. It also means the list is current at the moment of
 * choosing, which matters: the profe can add a badge from the admin console
 * without a deploy.
 *
 * After a successful write the tracker refetches instead of being patched from
 * the chosen row. The progress numbers come from the database and the client has
 * no way to compute them (that is the whole design — see badge-progress.ts), so
 * optimistically showing the new badge with a stale or invented bar would be worse
 * than a brief spinner.
 */
export default function BadgeTrackerCard({ initial }: { initial: TrackedBadgeState }) {
  const t = useTranslations("portal.tracker");
  const tCount = useTranslations("portal.tracker");

  const [state, setState] = useState(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [options, setOptions] = useState<Badge[] | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * `pending` is its own state rather than useTransition's `isPending`, matching
   * TeamFeed and SelfCheckInCard: on React 18 an async function passed to
   * startTransition stops being tracked at its first await, so isPending drops to
   * false while the action is still in flight — exactly the window the buttons
   * need to stay disabled for. The transition remains so the action's
   * revalidatePath lands as a non-blocking update.
   */
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setError(null);
    if (options || loadingOptions) return;
    setLoadingOptions(true);
    try {
      setOptions(await getTrackableBadges());
    } catch {
      setOptions([]);
      setError(t("loadFailed"));
    }
    setLoadingOptions(false);
  }, [options, loadingOptions, t]);

  const commit = useCallback(
    (badgeId: number | null) => {
      setPending(true);
      setError(null);
      startTransition(async () => {
        try {
          const result = await setOwnTrackedBadge(badgeId);
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setPickerOpen(false);
          // The picker's contents are now stale — the badge just chosen is still
          // eligible, but a concurrent award elsewhere may have retired others.
          setOptions(null);
          setState(await getOwnTrackedBadge());
        } catch {
          setError(t("saveFailed"));
        } finally {
          // finally, not on the happy path: a network drop mid-request would
          // otherwise leave every button disabled until a page reload.
          setPending(false);
        }
      });
    },
    [t]
  );

  const actions = (
    <div className="flex items-center gap-3 flex-none">
      <button
        type="button"
        onClick={openPicker}
        disabled={pending}
        className="text-xs font-semibold text-black dark:text-ink underline underline-offset-2 hover:opacity-70 disabled:opacity-40"
      >
        {state.badge ? t("change") : t("choose")}
      </button>
      {state.badge && (
        <button
          type="button"
          onClick={() => commit(null)}
          disabled={pending}
          className="text-xs text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40"
        >
          {t("clear")}
        </button>
      )}
      {pending && <Spinner size="sm" delay={false} className="text-muted" />}
    </div>
  );

  return (
    <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5">
      <BadgeTracker
        badge={state.badge}
        progress={state.progress}
        variant="light"
        actions={actions}
        labels={{
          heading: t("heading"),
          emptyTitle: t("emptyTitle"),
          emptyBody: t("emptyBody"),
          choose: t("choose"),
          change: t("change"),
          clear: t("clear"),
          // Through the catalogue's ICU plurals rather than a template: "clases"
          // and "días" are different words, and Spanish plural rules are not a
          // suffix the component could append.
          count: (current, target, unit) =>
            unit === "days"
              ? tCount("countDays", { current, target })
              : tCount("countClasses", { current, target }),
          remaining: (n, unit) =>
            unit === "days" ? tCount("remainingDays", { count: n }) : tCount("remainingClasses", { count: n }),
          complete: t("complete"),
          milestonePending: t("milestonePending"),
          manual: t("manual"),
          progressLabel: (current, target) => t("progressLabel", { current, target }),
        }}
      />

      {/* Inline rather than a toast: the failure belongs next to the control that
          caused it, and the portal has no toast surface. */}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <Modal
        open={pickerOpen}
        onClose={() => !pending && setPickerOpen(false)}
        title={t("pickerTitle")}
        subtitle={t("pickerSubtitle")}
      >
        {loadingOptions || options === null ? (
          <div className="py-8 flex justify-center">
            <Spinner size="md" />
          </div>
        ) : options.length === 0 ? (
          // Genuinely possible and worth its own sentence: a long-standing member
          // can hold every automatic badge in the catalogue, and "nothing here"
          // would read as a bug rather than as a compliment.
          <p className="text-sm text-muted py-4">{t("pickerEmpty")}</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {options.map((b) => {
              const isCurrent = state.badge?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => commit(b.id)}
                  disabled={pending}
                  aria-pressed={isCurrent}
                  className={`w-full flex items-center gap-3 text-left p-2.5 rounded-lg border transition-colors disabled:opacity-40 ${
                    isCurrent
                      ? "border-black dark:border-yellow bg-paper"
                      : "border-transparent hover:bg-off-white dark:hover:bg-paper"
                  }`}
                >
                  <BadgeMedal icon={b.icon} tier={b.tier} earned size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-black dark:text-ink leading-tight">
                      {b.name}
                    </span>
                    <span className="block text-xs text-muted leading-tight">{b.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
