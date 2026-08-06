import type { Metadata } from "next";
import { getGymProfile } from "@/lib/gym-profile";
import { getKioskUiConfig } from "@/lib/kiosk-ui-config.server";
import { KioskUiProvider } from "@/lib/kiosk-ui-context";

// Kiosk layout — completely isolated from the admin shell.
// No nav, no sidebar, no admin cookies needed beyond the kiosk_token.
export async function generateMetadata(): Promise<Metadata> {
  const profile = await getGymProfile();
  return { title: `Check In — ${profile.shortName}` };
}

export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  // Fetch kiosk UI config server-side so client pads can read it without a
  // round-trip. Falls through to defaults if the DB isn't reachable.
  const uiConfig = await getKioskUiConfig();

  return (
    // h-[100dvh] + overflow-hidden: kiosk must never scroll at the layout level.
    // `dvh` (dynamic viewport height) accounts for browser-chrome show/hide on
    // mobile + tablet Safari/Chrome — plain `100vh` leaves overflow when the
    // toolbar collapses on scroll. The checkin page manages scroll internally,
    // per section.
    <div className="h-[100dvh] overflow-hidden bg-black text-white font-body antialiased">
      <KioskUiProvider config={uiConfig}>{children}</KioskUiProvider>
    </div>
  );
}
