import { Lock } from "lucide-react";
import { badgeIcon, TIER_STYLES } from "@/lib/badges";
import type { Badge, BadgeTier } from "@/lib/supabase/types";

/**
 * How a badge LOOKS, in one place.
 *
 * The medal — a tier-coloured disc with the badge's lucide icon in it, or a grey
 * locked silhouette — was drawn four separate times: the portal's badge wall, the
 * celebration modal, the admin console's award list, and the kiosk's post-check-in
 * success screen. Each copy resolved the icon and the tier colours itself, so
 * "make locked badges look locked on the kiosk too" meant editing four files and
 * the fourth one was always the one that got missed.
 *
 * No copy lives here, deliberately. The names and descriptions are the gym's own
 * words out of the database (rendered verbatim, per the authorship rule in
 * src/i18n/request.ts), and the only string the medal itself needs — the
 * screen-reader word for "locked" — is INJECTED rather than looked up, because
 * this renders on the kiosk as well as in the portal and the kiosk has no
 * NextIntlClientProvider. Calling useTranslations here would put Spanish on an
 * otherwise English wall-mounted tablet. Same pattern as StatsTilesGrid.
 *
 * No "use client": it is pure presentation with no hooks, so the portal's server
 * components and the kiosk's client tree can both render it.
 */

/**
 * Medal sizes, from the smallest in-list disc to the celebration modal's hero.
 *
 * The border width is per-size rather than uniform because the existing surfaces
 * disagreed and both were right: at 14 the hairline reads as a rim, at 11 and
 * below it disappears and the disc needs `border-2` to keep its shape against a
 * dark background. Locking that in per size is what lets this component replace
 * the old markup pixel-for-pixel instead of "close enough".
 *
 * `xl` exists for the kiosk: a shared touchscreen is read from a metre away, and
 * a 56px disc that works on a phone held at arm's length is a smudge across the
 * room.
 */
export type BadgeMedalSize = "sm" | "md" | "lg" | "xl";

interface SizeSpec {
  disc: string;
  border: string;
  icon: string;
  /** The little lock sub-badge pinned to the bottom-right of a locked medal. */
  lockDisc: string;
  lockIcon: string;
}

const SIZES: Record<BadgeMedalSize, SizeSpec> = {
  sm: { disc: "w-11 h-11", border: "border-2", icon: "w-6 h-6",   lockDisc: "w-4 h-4",  lockIcon: "w-2 h-2" },
  md: { disc: "w-14 h-14", border: "border",   icon: "w-7 h-7",   lockDisc: "w-5 h-5",  lockIcon: "w-2.5 h-2.5" },
  lg: { disc: "w-20 h-20", border: "border-2", icon: "w-10 h-10", lockDisc: "w-6 h-6",  lockIcon: "w-3 h-3" },
  xl: { disc: "w-24 h-24", border: "border-2", icon: "w-12 h-12", lockDisc: "w-7 h-7",  lockIcon: "w-3.5 h-3.5" },
};

/**
 * Which surface the medal sits on.
 *
 * "light" — a themed card (portal, admin console). Locked medals use the paper /
 *   line / muted tokens and follow dark mode with the rest of the card.
 * "dark"  — the kiosk's black background, where those tokens are invisible, so
 *   locked medals fall back to translucent white.
 *
 * The EARNED medal is identical in both: tier colours are metal colours passed as
 * inline styles precisely so they don't move with the theme (see TIER_STYLES).
 */
export type BadgeSurface = "light" | "dark";

export interface BadgeMedalProps {
  /** lucide-react icon name from `badges.icon`. Unknown names fall back to Award. */
  icon: string | null | undefined;
  tier: BadgeTier;
  /** false draws the locked silhouette with the lock sub-badge. */
  earned: boolean;
  size?: BadgeMedalSize;
  surface?: BadgeSurface;
  /**
   * Screen-reader text for the lock. Injected, not translated here — see the
   * header. Omit it on a surface where the lock is already described in text
   * next to the medal, so it isn't announced twice.
   */
  lockedLabel?: string;
  className?: string;
}

export function BadgeMedal({
  icon,
  tier,
  earned,
  size = "md",
  surface = "light",
  lockedLabel,
  className = "",
}: BadgeMedalProps) {
  const Icon = badgeIcon(icon);
  const s = SIZES[size];

  if (earned) {
    const style = TIER_STYLES[tier];
    return (
      <div
        className={`${s.disc} ${s.border} rounded-full flex items-center justify-center flex-none ${className}`}
        style={{ backgroundColor: style.bg, borderColor: style.fg, color: style.fg }}
      >
        <Icon className={s.icon} aria-hidden="true" />
      </div>
    );
  }

  const lockedDisc =
    surface === "dark"
      ? "border-white/15 bg-white/5 text-white/40"
      : "border-line bg-paper text-muted";
  const lockedPip =
    surface === "dark"
      ? "bg-near-black border-white/15 text-white/40"
      : "bg-white dark:bg-portal-card border-line text-muted";

  return (
    <div
      className={`relative ${s.disc} ${s.border} ${lockedDisc} rounded-full flex items-center justify-center flex-none ${className}`}
    >
      <Icon className={s.icon} aria-hidden="true" />
      <span
        className={`absolute -bottom-0.5 -right-0.5 ${s.lockDisc} ${lockedPip} rounded-full border flex items-center justify-center`}
      >
        <Lock className={s.lockIcon} aria-hidden="true" />
        {lockedLabel && <span className="sr-only">{lockedLabel}</span>}
      </span>
    </div>
  );
}

// ── Tile ─────────────────────────────────────────────────────────────────────

export interface BadgeTileProps {
  /** Any catalogue row. `EarnedBadge` callers pass `item.badge`. */
  badge: Pick<Badge, "name" | "description" | "icon" | "tier">;
  earned: boolean;
  /** The profe's words on a manual award — the part members screenshot. */
  note?: string | null;
  size?: BadgeMedalSize;
  surface?: BadgeSurface;
  lockedLabel?: string;
  className?: string;
}

/**
 * Medal + name + description, centred — the unit the badge wall is made of.
 *
 * The `opacity-45` on a locked tile covers the whole tile rather than just the
 * medal, which is why it lives here and not in BadgeMedal: dimming the label is
 * most of what makes a locked badge read as locked at a glance.
 */
export function BadgeTile({
  badge,
  earned,
  note,
  size = "md",
  surface = "light",
  lockedLabel,
  className = "",
}: BadgeTileProps) {
  const dim = earned ? "" : "opacity-45";

  // The kiosk is read standing up, at arm's length or further, so its text steps
  // up a size. Keyed off the surface rather than a separate prop: "on the kiosk"
  // and "needs to be legible across the room" are the same condition, and a
  // second prop would let them drift apart.
  const nameCls =
    surface === "dark"
      ? "text-sm font-semibold text-white leading-tight"
      : "text-xs font-semibold text-black dark:text-ink leading-tight";
  const descCls =
    surface === "dark"
      ? "text-xs text-white/40 leading-tight"
      : "text-[11px] text-muted leading-tight";
  const noteCls =
    surface === "dark"
      ? "text-xs text-white/60 italic leading-tight mt-0.5"
      : "text-[11px] text-ink italic leading-tight mt-0.5";

  return (
    <div className={`flex flex-col items-center text-center gap-1.5 ${dim} ${className}`}>
      <BadgeMedal
        icon={badge.icon}
        tier={badge.tier}
        earned={earned}
        size={size}
        surface={surface}
        lockedLabel={lockedLabel}
      />
      <div className={nameCls}>{badge.name}</div>
      <div className={descCls}>{badge.description}</div>
      {note && <div className={noteCls}>&ldquo;{note}&rdquo;</div>}
    </div>
  );
}

export default BadgeMedal;
