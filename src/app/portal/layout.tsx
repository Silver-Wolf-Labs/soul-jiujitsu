import PortalNav from "./PortalNav";
import PortalAuthGuard from "./PortalAuthGuard";
import PortalSessionGuard from "./PortalSessionGuard";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-portal-theme is what switches the whole subtree to the dark palette:
    // it both re-points the --color-* custom properties (portal-dark.css) and
    // activates Tailwind's `dark:` variant (darkMode is keyed to this exact
    // attribute). Scoping it here rather than on <html> is the point — the admin
    // console and the public site stay light, and components shared with them
    // are unaffected.
    <div data-portal-theme="dark" className="min-h-screen bg-off-white">
      <PortalAuthGuard />
      <PortalSessionGuard />
      <PortalNav />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
