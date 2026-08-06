import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";
import AdminPageTransition from "@/components/admin/AdminPageTransition";
import AdminSessionGuard from "@/components/admin/AdminSessionGuard";
import { NavigationProvider } from "@/components/admin/NavigationContext";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { getGymProfile } from "@/lib/gym-profile";
import { getAdminSessionTtl } from "@/lib/admin-session-config.server";

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getGymProfile();
  return { title: `Admin — ${profile.shortName}` };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  // Load the admin's chosen hard-session TTL so AdminSessionGuard can feed
  // the correct hardExpiresAt into the shared SessionWarning modal.
  const { ms: hardMs } = await getAdminSessionTtl();

  return (
    <NavigationProvider>
      <AdminSessionGuard hardMs={hardMs} />
      <div className="flex min-h-screen bg-off-white font-body">
        <AdminShell />
        <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0">
          <AdminPageTransition>{children}</AdminPageTransition>
        </main>
      </div>
    </NavigationProvider>
  );
}
