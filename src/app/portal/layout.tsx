import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import PortalNav from "./PortalNav";
import PortalAuthGuard from "./PortalAuthGuard";
import PortalSessionGuard from "./PortalSessionGuard";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Scoped to the portal's namespace rather than handed the whole catalogue.
  // Everything under NextIntlClientProvider is serialised into the HTML for the
  // client components to hydrate from, so shipping admin and public strings here
  // would put copy a member never sees into a member's page weight.
  const messages = await getMessages();
  const portalMessages = { portal: (messages as { portal: unknown }).portal };

  return (
    // data-portal-theme is what switches the whole subtree to the dark palette:
    // it both re-points the --color-* custom properties (portal-dark.css) and
    // activates Tailwind's `dark:` variant (darkMode is keyed to this exact
    // attribute). Scoping it here rather than on <html> is the point — the admin
    // console and the public site stay light, and components shared with them
    // are unaffected.
    <div data-portal-theme="dark" className="min-h-screen bg-off-white">
      <NextIntlClientProvider messages={portalMessages}>
        <PortalAuthGuard />
        <PortalSessionGuard />
        <PortalNav />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </NextIntlClientProvider>
    </div>
  );
}
