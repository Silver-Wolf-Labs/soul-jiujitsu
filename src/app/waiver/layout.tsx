import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * /waiver lives OUTSIDE the portal route group — a member who hasn't signed is
 * bounced here by middleware before the portal is reachable — so it does not
 * inherit `portal/layout.tsx`'s provider. Without this layout the two client
 * components on the page (WaiverSignButton, WaiverSignOutLink) throw on
 * `useTranslations`: there is no NextIntlClientProvider anywhere above them,
 * because the root layout deliberately has none.
 *
 * Scoped to the `waiver` namespace for the same reason the portal scopes to
 * `portal`: everything handed to the provider is serialised into the HTML for
 * hydration, and this page is the very first authenticated screen a new member
 * sees. Shipping the whole catalogue would put the entire portal's copy into a
 * page that shows one form.
 *
 * No wrapper markup — the page owns its own full-screen background — so this is
 * a pass-through and the page's layout is unaffected.
 */
export default async function WaiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  const waiverMessages = { waiver: (messages as { waiver: unknown }).waiver };

  return (
    <NextIntlClientProvider messages={waiverMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
