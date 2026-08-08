"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/ui/Modal";
import { TIER_STYLES } from "@/lib/badges";
import { BadgeMedal } from "@/components/member/BadgeMedal";
import { markOwnBadgesSeen } from "@/lib/actions/portal";
import type { EarnedBadge } from "@/lib/supabase/types";

/**
 * One-time celebration for badges the member hasn't seen yet.
 *
 * Fires once per badge: dismissing marks every unseen row as seen, so a reload
 * doesn't replay it. The seen_at write is deliberately fire-and-forget — if it
 * fails the member sees the celebration twice, which is a far better failure
 * than a modal that blocks the portal behind a spinner.
 */
export default function BadgeCelebration({ unseen }: { unseen: EarnedBadge[] }) {
  // These strings were already Spanish, hard-coded — the right language reached by
  // the wrong route. Through the catalogue they are now findable and changeable in
  // one place with the rest of the portal's copy.
  const t = useTranslations("portal.celebration");
  const tTier = useTranslations("portal.badges.tiers");
  const [open, setOpen] = useState(unseen.length > 0);
  const [index, setIndex] = useState(0);

  // Mark seen as soon as the modal is shown rather than on dismiss: a member who
  // closes the tab instead of clicking through has still seen it, and replaying
  // it on their next visit would feel broken.
  useEffect(() => {
    if (unseen.length > 0) void markOwnBadgesSeen();
  }, [unseen.length]);

  if (unseen.length === 0) return null;

  const current = unseen[index];
  // Only for the tier NAME's colour below — the medal resolves its own colours.
  const tier = TIER_STYLES[current.badge.tier];
  const isLast = index === unseen.length - 1;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t("title")}
      subtitle={unseen.length > 1 ? t("counter", { index: index + 1, total: unseen.length }) : undefined}
    >
      <div className="flex flex-col items-center text-center gap-3 py-2">
        {/* `xl` is exactly the 24/12 disc this modal always drew — the size scale
            in BadgeMedal was derived from the four existing surfaces, not imposed
            on them. */}
        <BadgeMedal icon={current.badge.icon} tier={current.badge.tier} earned size="xl" />

        <div>
          <div className="font-display text-2xl text-black dark:text-ink">{current.badge.name}</div>
          <div className="text-xs uppercase tracking-wide mt-0.5" style={{ color: tier.fg }}>
            {tTier(current.badge.tier)}
          </div>
        </div>

        <p className="text-sm text-ink">{current.badge.description}</p>

        {current.note && (
          <p className="text-sm text-ink italic border-l-2 border-line pl-3 text-left w-full">
            &ldquo;{current.note}&rdquo;
          </p>
        )}

        <div className="text-sm font-semibold text-black">{t("xpReward", { xp: current.badge.xp_reward })}</div>

        <button
          type="button"
          onClick={() => (isLast ? setOpen(false) : setIndex(index + 1))}
          className="mt-2 w-full py-2.5 bg-black text-white dark:bg-yellow dark:text-black rounded font-semibold text-sm hover:bg-near-black dark:hover:bg-yellow-deep transition-colors"
        >
          {isLast ? t("done") : t("next")}
        </button>
      </div>
    </Modal>
  );
}
