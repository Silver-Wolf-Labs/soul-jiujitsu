"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { BadgeMedal } from "@/components/member/BadgeMedal";
import BadgeTracker from "@/components/member/BadgeTracker";
import {
  addOwnTrackedBadge,
  getOwnTrackedBadges,
  getTrackableBadges,
  removeOwnTrackedBadge,
} from "@/lib/actions/portal";
import { canTrackMore, MAX_TRACKED_BADGES, type TrackedBadgeEntry } from "@/lib/badge-progress";
import type { Badge } from "@/lib/supabase/types";

/**
 * The portal's tracker: the shared BadgeTracker plus the controls to add and remove
 * goals, up to three.
 *
 * The picker's catalogue is fetched when the modal opens rather than
 * server-rendered with the page. It is a list only ever seen by a member who taps
 * "Agregar objetivo", and paying ~30 rows on every portal load — including the
 * majority of loads that never open it — to save a spinner on the minority that
 * do is the wrong trade. It also means the list is current at the moment of
 * choosing, which matters: the profe can add a badge from the admin console
 * without a deploy.
 *
 * After a successful write the tracker refetches instead of being patched from the
 * chosen row. The progress numbers come from the database and the client has no way
 * to compute them (that is the whole design — see badge-progress.ts), so
 * optimistically showing a new badge with a stale or invented bar would be worse
 * than a brief spinner. That applies to REMOVE too, even though dropping a row is
 * the one change the client could compute correctly, because the alternative is two
 * code paths where one has to stay in sync with the server's ordering.
 */
export default function BadgeTrackerCard({ initial }: { initial: TrackedBadgeEntry[] }) {
  const t = useTranslations("portal.tracker");

  const [tracked, setTracked] = useState<TrackedBadgeEntry[]>(initial);
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

  const hasRoom = canTrackMore(tracked);

  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setError(null);
    // Always refetch: the list now excludes badges already being tracked, so a
    // cached copy from before the last add would still offer a badge that is now
    // on the card. Cheap, and the alternative is a picker row that fails on tap.
    setLoadingOptions(true);
    try {
      setOptions(await getTrackableBadges());
    } catch {
      setOptions([]);
      setError(t("loadFailed"));
    }
    setLoadingOptions(false);
  }, [t]);

  /**
   * One helper for both writes: they differ only in the action called and in
   * whether the picker should close afterwards.
   *
   * The picker stays open after an add so a member can pick their second and third
   * goals in one sitting — closing it would make filling three slots three separate
   * trips through the same modal. It closes on its own once the last slot is taken,
   * since there is nothing left to choose.
   */
  const run = useCallback(
    (op: () => Promise<{ success: true } | { error: string }>, closeWhenFull: boolean) => {
      setPending(true);
      setError(null);
      startTransition(async () => {
        try {
          const result = await op();
          if ("error" in result) {
            setError(result.error);
            return;
          }
          const [next, freshOptions] = await Promise.all([
            getOwnTrackedBadges(),
            // The picker's contents are stale either way: an add removes a row from
            // it, and a remove puts one back.
            getTrackableBadges().catch(() => null),
          ]);
          setTracked(next);
          if (freshOptions) setOptions(freshOptions);
          if (closeWhenFull && !canTrackMore(next)) setPickerOpen(false);
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

  const add = useCallback(
    (badgeId: number) => run(() => addOwnTrackedBadge(badgeId), true),
    [run]
  );

  const remove = useCallback(
    (badgeId: number) => run(() => removeOwnTrackedBadge(badgeId), false),
    [run]
  );

  const actions = (
    <div className="flex items-center gap-3 flex-none">
      {/* Disabled rather than hidden at three goals: a button that vanishes reads
          as a bug, and the disabled state plus the "3 / 3" counter next to the
          heading together explain why nothing happens. */}
      <button
        type="button"
        onClick={openPicker}
        disabled={pending || !hasRoom}
        title={hasRoom ? undefined : t("full")}
        className="text-xs font-semibold text-black dark:text-ink underline underline-offset-2 hover:opacity-70 disabled:opacity-40 disabled:no-underline"
      >
        {tracked.length === 0 ? t("choose") : t("add")}
      </button>
      {pending && <Spinner size="sm" delay={false} className="text-muted" />}
    </div>
  );

  return (
    <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5">
      <BadgeTracker
        tracked={tracked}
        variant="light"
        actions={actions}
        rowActions={(entry) => (
          <button
            type="button"
            onClick={() => remove(entry.badge.id)}
            disabled={pending}
            // An icon rather than the word: with three rows, three copies of
            // "Quitar" is the loudest thing on the card. The name goes to screen
            // readers, which is the only place the word is load-bearing.
            aria-label={t("clearOne", { name: entry.badge.name })}
            title={t("clear")}
            className="p-1.5 -mr-1.5 rounded-md text-muted hover:text-ink hover:bg-off-white dark:hover:bg-paper disabled:opacity-40 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        labels={{
          heading: t("heading"),
          emptyTitle: t("emptyTitle"),
          emptyBody: t("emptyBody"),
          slots: (used, max) => t("slots", { used, max }),
          // Through the catalogue's ICU plurals rather than a template: "clases"
          // and "días" are different words, and Spanish plural rules are not a
          // suffix the component could append.
          count: (current, target, unit) =>
            unit === "days"
              ? t("countDays", { current, target })
              : t("countClasses", { current, target }),
          remaining: (n, unit) =>
            unit === "days" ? t("remainingDays", { count: n }) : t("remainingClasses", { count: n }),
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
        subtitle={t("pickerSubtitle", { remaining: MAX_TRACKED_BADGES - tracked.length })}
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
            {options.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => add(b.id)}
                // `!hasRoom` as well as `pending`: the modal stays open after an
                // add, so the third pick has to leave the remaining rows inert
                // rather than letting a fourth tap through to a server refusal.
                disabled={pending || !hasRoom}
                className="w-full flex items-center gap-3 text-left p-2.5 rounded-lg border border-transparent hover:bg-off-white dark:hover:bg-paper transition-colors disabled:opacity-40"
              >
                <BadgeMedal icon={b.icon} tier={b.tier} earned size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-black dark:text-ink leading-tight">
                    {b.name}
                  </span>
                  <span className="block text-xs text-muted leading-tight">{b.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {/* Repeated inside the modal because the card's copy is behind the overlay
            when the failure comes from a pick. */}
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        {!hasRoom && <p className="mt-3 text-xs text-muted">{t("full")}</p>}
      </Modal>
    </div>
  );
}
