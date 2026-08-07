import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { MemberStatus, MemberMembership, MembershipPlan } from "@/lib/supabase/types";
import { getGymProfile } from "@/lib/gym-profile";
import { formatDateTz, formatDateTimeTz } from "@/lib/utils";
import CurrentPlanCard from "./CurrentPlanCard";
import CheckoutReturnBanner from "./CheckoutReturnBanner";
import WaiverStatusBanner from "./WaiverStatusBanner";
import {
  getOwnMemberStats,
  getOwnGymRankings,
  getOwnGamification,
  getOwnBadges,
  getOwnTodayClasses,
  getTeamLeaderboard,
  getTeamActivity,
} from "@/lib/actions/portal";
import SelfCheckInCard from "./SelfCheckInCard";
import TeamFeed from "@/components/member/TeamFeed";
import type { PortalTodayClass } from "@/lib/actions/portal";
import type { TeamMemberEntry, TeamActivityEntry } from "@/lib/supabase/types";
import BeltVisual from "@/components/ui/BeltVisual";
import PortalCheckInsCard from "./PortalCheckInsCard";
import PortalStatsCard from "./PortalStatsCard";
import XpProgressCard from "@/components/member/XpProgressCard";
import StreakCard from "@/components/member/StreakCard";
import BadgeGrid from "@/components/member/BadgeGrid";
import BadgeCelebration from "@/components/member/BadgeCelebration";
import type {
  CheckInRow,
  MemberGamification,
  Badge,
  EarnedBadge,
} from "@/lib/supabase/types";

const STATUS_COLORS: Record<MemberStatus, string> = {
  prospect: "bg-disabled-light text-muted",
  trial: "bg-blue-light text-blue",
  active: "bg-success-light text-success",
  inactive: "bg-disabled-light text-muted",
  suspended: "bg-danger-light text-danger",
};

type ActiveMembership = MemberMembership & { membership_plans: Pick<MembershipPlan, "name" | "price_cents" | "billing_interval"> | null };

export default async function PortalHomePage() {
  // getTranslations, not useTranslations: this is an async component, and hooks
  // can't be called after an await.
  const [supabase, profile, t, tSignedOut, tStatus, tBelt] = await Promise.all([
    Promise.resolve(createClient()),
    getGymProfile(),
    getTranslations("portal.home"),
    getTranslations("portal.signedOut"),
    getTranslations("portal.memberStatus"),
    getTranslations("portal.belt"),
  ]);
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return (
      <div className="min-h-screen bg-off-white flex items-start justify-center px-4">
        <div className="max-w-sm mx-auto mt-16 w-full p-8 bg-white dark:bg-portal-card border border-line rounded-lg shadow-sm">
          <div className="h-1 w-full bg-gradient-to-r from-yellow to-blue-mid to-purple-light -mx-8 -mt-8 mb-8 rounded-t-lg" style={{ width: "calc(100% + 4rem)" }} />
          <div className="text-center mb-8">
            <div className="font-display text-2xl text-black dark:text-ink tracking-tight">{profile.logoText} &bull; {profile.cityName.toUpperCase()}</div>
            <div className="text-sm text-muted mt-1">{tSignedOut("subtitle")}</div>
          </div>
          <div className="space-y-3">
            <Link
              href="/portal/login"
              className="block w-full py-2.5 bg-black text-white dark:bg-yellow dark:text-black rounded font-semibold text-sm text-center hover:bg-near-black dark:hover:bg-yellow-deep transition-colors"
            >
              {tSignedOut("signIn")}
            </Link>
            {/* Admin-authored, straight from site_settings — the profe writes this
                label, so it is not the catalogue's to translate. */}
            <Link
              href="/join"
              className="block w-full py-2.5 bg-white dark:bg-portal-card text-black dark:text-ink rounded font-semibold text-sm text-center border border-line hover:border-black dark:hover:border-yellow transition-colors"
            >
              {profile.joinButtonText}
            </Link>
          </div>
          <p className="mt-6 text-center text-xs text-muted">
            {tSignedOut("forgotPrompt")}{" "}
            <Link href="/portal/forgot-password" className="text-black dark:text-ink underline underline-offset-2 hover:opacity-70">
              {tSignedOut("forgotLink")}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, status, belt, stripes, created_at, waiver_signed_at, waiver_status")
    .eq("user_id", userData.user.id)
    .single();

  // Derive a "Signed as XY" shorthand from the member's name. Matches the
  // typed-initial convention in the signup waiver flow and on the profile
  // waiver card, so the value feels consistent across surfaces.
  const memberInitials = member
    ? `${(member.first_name?.[0] ?? "").toUpperCase()}${(member.last_name?.[0] ?? "").toUpperCase()}`
    : "";

  const { data: memberships } = member
    ? await supabase
        .from("member_memberships")
        .select("*, membership_plans(*)")
        .eq("member_id", member.id)
        .in("status", ["active", "trialing"])
        .order("started_at", { ascending: false })
        .limit(1)
    : { data: null };

  const activeMembership = memberships?.[0] as ActiveMembership | undefined;
  const plan = activeMembership?.membership_plans ?? null;
  const effectivePrice = activeMembership
    ? (activeMembership.override_price_cents ?? activeMembership.locked_price_cents)
    : null;

  // Fetch member stats + rankings for the stats tiles.
  // Wrapped in try/catch so a stats RPC failure doesn't break the whole page.
  let memberStats = null;
  let gymRankings = null;
  try {
    [memberStats, gymRankings] = await Promise.all([
      getOwnMemberStats(),
      getOwnGymRankings(),
    ]);
  } catch {
    // Stats are non-critical; the rest of the page still renders.
  }

  // Gamification (XP, streak, badges). Separate try/catch from the stats above
  // so a failure in either one doesn't take out the other — a member with a
  // broken badge row should still see their attendance.
  let gamification: MemberGamification | null = null;
  let badges: { earned: EarnedBadge[]; locked: Badge[] } = { earned: [], locked: [] };
  try {
    [gamification, badges] = await Promise.all([
      getOwnGamification(),
      getOwnBadges(),
    ]);
  } catch {
    // Non-critical; the rest of the page still renders.
  }
  const unseenBadges = badges.earned.filter((b) => b.seen_at === null);

  // Today's schedule for self check-in, plus the social feed's first paint.
  // Separate try/catch again, and separate from each other: the team feed reads
  // through SECURITY DEFINER RPCs that a fresh deploy might not have yet, and
  // that must not be able to take away a member's ability to check in.
  let todayClasses: PortalTodayClass[] = [];
  try {
    todayClasses = await getOwnTodayClasses();
  } catch {
    // Falls through to SelfCheckInCard's noClassesToday empty state.
  }

  let teamLeaderboard: TeamMemberEntry[] = [];
  let teamActivity: TeamActivityEntry[] = [];
  try {
    [teamLeaderboard, teamActivity] = await Promise.all([
      getTeamLeaderboard(),
      getTeamActivity(),
    ]);
  } catch {
    // Non-critical; the feed renders its own empty state.
  }

  if (!member) {
    return (
      <div className="text-center py-16 text-muted">
        {t("noMemberRecord")}
      </div>
    );
  }

  // Today's check-ins (gym-local date). We feed the server query the same
  // YYYY-MM-DD string the kiosk / undo-server-action use so all three agree
  // on "today" regardless of the Vercel region's UTC offset.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: profile.timezone });
  const { data: rawCheckIns } = await supabase
    .from("check_ins")
    .select("id, class_name, class_date, checked_in_at, source")
    .eq("member_id", member.id)
    .eq("class_date", today)
    .order("created_at", { ascending: false });
  const todaysCheckIns = (rawCheckIns ?? []) as CheckInRow[];

  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <CheckoutReturnBanner />
      </Suspense>

      <WaiverStatusBanner status={member.waiver_status} />

      <div>
        <h1 className="font-display text-3xl text-black dark:text-ink">
          {t("welcome", { firstName: member.first_name })}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          {/* `capitalize` is gone with the raw status: the enum value used to be
              rendered as-is ("trial"), so it needed the CSS to look like a label.
              The catalogue carries its own casing. */}
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[member.status as MemberStatus]}`}
          >
            {tStatus(member.status as MemberStatus)}
          </span>
          <span className="text-sm text-muted">
            {t("memberSince", { date: formatDateTz(member.created_at, profile.timezone) })}
          </span>
        </div>
      </div>

      {/* Self check-in, first thing under the greeting. It's the only action on
          this page a member comes here to *do* — everything below is something
          they came to look at. */}
      <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
          {t("checkInHeading")}
        </div>
        <SelfCheckInCard classes={todayClasses} />
      </div>

      {/* Progress row. Sits above the account cards on purpose: the level bar and
          the streak are what we want a member to see first, since they're the two
          numbers that change when they show up to train. */}
      {gamification && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <XpProgressCard data={gamification} />
          <StreakCard data={gamification} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Belt rank card */}
        <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5 flex flex-col">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t("rankHeading")}</div>
          <BeltVisual
            belt={(member.belt ?? "white") as "white" | "blue" | "purple" | "brown" | "black"}
            stripes={member.stripes ?? 0}
          />
          {/* "cinturón blanco", not "white belt" — Spanish puts the noun first, so
              the colour can't be interpolated as a bare adjective before a literal
              "belt". `first-letter:uppercase` replaces `capitalize`, which would
              have upper-cased both words. */}
          <div className="mt-2 text-sm text-ink font-semibold first-letter:uppercase">
            {t("beltLabel", { belt: tBelt(member.belt ?? "white") })}
            {(member.stripes ?? 0) > 0 && (
              <span className="font-normal text-muted"> · {t("stripes", { count: member.stripes ?? 0 })}</span>
            )}
          </div>
        </div>

        {/* Current Plan card */}
        <CurrentPlanCard
          activeMembership={activeMembership ?? null}
          plan={plan}
          effectivePrice={effectivePrice}
        />

        {/* Waiver card */}
        <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5 flex flex-col">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t("waiverHeading")}</div>
          {member.waiver_signed_at ? (
            <>
              <div className="font-display text-lg text-success">{t("waiverSigned")}</div>
              <div className="text-sm text-muted mt-1">
                {t.rich("waiverSignedAs", {
                  initials: memberInitials,
                  strong: (chunks) => (
                    <span className="font-semibold text-black dark:text-ink tracking-widest">
                      {chunks}
                    </span>
                  ),
                })}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {formatDateTimeTz(member.waiver_signed_at, profile.timezone)}
              </div>
              <Link
                href="/portal/profile?tab=waiver"
                className="mt-auto pt-3 text-sm text-black dark:text-ink underline underline-offset-2 hover:opacity-70"
              >
                {t("waiverViewDetails")}
              </Link>
            </>
          ) : (
            <>
              <div className="font-display text-lg text-danger">{t("waiverNotSigned")}</div>
              <div className="text-sm text-muted mt-1">{t("waiverContactGym")}</div>
            </>
          )}
        </div>

        {/* Quick links card */}
        <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5 flex flex-col">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t("quickLinksHeading")}</div>
          <Link
            href="/portal/profile"
            className="block w-full py-2.5 bg-black text-white dark:bg-yellow dark:text-black rounded font-semibold text-sm text-center hover:bg-near-black dark:hover:bg-yellow-deep transition-colors mb-3"
          >
            {t("editProfile")}
          </Link>
          <div className="space-y-2">
            <Link
              href="/portal/profile?tab=emergency"
              className="block text-sm text-black dark:text-ink underline underline-offset-2 hover:opacity-70"
            >
              {t("emergencyContacts")}
            </Link>
            <Link
              href="/portal/profile?tab=billing"
              className="block text-sm text-black dark:text-ink underline underline-offset-2 hover:opacity-70"
            >
              {t("billingHistory")}
            </Link>
            {/* Self-serve billing — goes to Stripe Customer Portal.
                Members can cancel (at period end), update payment
                method, download invoices. No admin involvement.
                The route handles the stripe-customer-missing case by
                redirecting back here with ?billing_error=... */}
            <a
              href="/api/portal/billing"
              className="block text-sm text-black dark:text-ink underline underline-offset-2 hover:opacity-70"
            >
              {t("manageBilling")} ↗
            </a>
          </div>
        </div>
      </div>

      {/* Stats + today's check-ins — side-by-side on tablet+, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-[7fr_3fr] lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t("statsHeading")}</div>
          <PortalStatsCard memberStats={memberStats} gymRankings={gymRankings} />
        </div>
        <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-5">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            {t("todaysCheckInsHeading")}
          </div>
          <PortalCheckInsCard initial={todaysCheckIns} today={today} />
        </div>
      </div>

      {/* Badge wall — earned badges plus the locked ones as goals. */}
      <BadgeGrid earned={badges.earned} locked={badges.locked} />

      {/* The rest of the gym. Last because it's the browsing surface: a member
          checks in, sees their own numbers, then looks outward. */}
      <TeamFeed initialLeaderboard={teamLeaderboard} initialActivity={teamActivity} />

      {/* Fires once for anything earned since the member last looked. */}
      <BadgeCelebration unseen={unseenBadges} />
    </div>
  );
}
