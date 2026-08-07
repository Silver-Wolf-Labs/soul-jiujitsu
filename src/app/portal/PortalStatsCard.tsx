"use client";

import { useTranslations } from "next-intl";
import StatsTilesGrid from "@/components/member/StatsTilesGrid";
import type { KioskMemberStats, GymRankings } from "@/lib/actions/check-ins";

/**
 * The portal's Spanish wrapper around StatsTilesGrid.
 *
 * StatsTilesGrid is shared with the kiosk (still English) so its copy is injected
 * rather than resolved inside it — see the Copy block there. Several of those
 * labels are functions, because Spanish plurals are ICU-formatted rather than
 * "add an s", and a function can't be passed from a server component to a client
 * one. So the labels are built here, on the client side of the boundary; the
 * portal home stays an RSC and passes only data.
 */
export default function PortalStatsCard({
  memberStats,
  gymRankings,
}: {
  memberStats: KioskMemberStats | null;
  gymRankings: GymRankings | null;
}) {
  const t = useTranslations("portal.stats");

  return (
    <StatsTilesGrid
      memberStats={memberStats}
      gymRankings={gymRankings}
      variant="light"
      labels={{
        tabYou: t("tabYou"),
        tabGym: t("tabGym"),
        month: t("thisMonth"),
        streak: t("weekStreak"),
        alltime: t("allTime"),
        week: t("thisWeek"),
        classes: (count) => t("classes", { count }),
        weeks: (count) => t("weeks", { count }),
        trainToday: t("trainToday"),
        startOne: t("startOne"),
        letsGo: t("letsGo"),
        // `count` rather than `avg`: the catalogue names it count for consistency
        // with the other numeric messages. It is a decimal average, not a plural
        // selector, so the message interpolates it plainly.
        avgPerWeek: (avg) => t("avgPerWeek", { count: avg }),
        trainToRank: t("trainToRank"),
        ofMembers: (count) => t("ofMembers", { count }),
        // "#3", not "3.º". Spanish has no ordinal-suffix system like "1st/2nd/3rd",
        // and the written ordinal ("tercero") is far too long for a tile — so the
        // rank is shown as a position number, which is how a Costa Rican gym would
        // read a standing anyway. English keeps the ordinal via the defaults.
        rankPosition: (rank) => t("rankPosition", { rank }),
        rankPercentile: (percent) => t("rankPercentile", { percent }),
      }}
    />
  );
}
