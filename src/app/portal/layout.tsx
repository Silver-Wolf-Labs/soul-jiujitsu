import PortalNav from "./PortalNav";
import PortalAuthGuard from "./PortalAuthGuard";
import PortalSessionGuard from "./PortalSessionGuard";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-off-white">
      <PortalAuthGuard />
      <PortalSessionGuard />
      <PortalNav />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
