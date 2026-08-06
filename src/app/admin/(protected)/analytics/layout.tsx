import type { Metadata } from "next";
import { getGymProfile } from "@/lib/gym-profile";

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getGymProfile();
  return { title: `Analytics — ${profile.shortName}` };
}

/**
 * Analytics layout — keeps the visual shell consistent across the four
 * dashboards (+ the per-page PeriodBar, which is rendered inside each
 * page because it needs the current page's Period data to format the
 * range label).
 */
export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full">{children}</div>;
}
