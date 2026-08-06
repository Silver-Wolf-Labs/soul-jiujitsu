import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import SuperAdminShell from "./SuperAdminShell";
import SuperAdminSessionGuard from "./SuperAdminSessionGuard";

export const metadata: Metadata = {
  title: "Platform Admin",
  robots: { index: false, follow: false },
};

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check (defense in depth — middleware also checks)
  await requireSuperAdmin();

  return (
    <>
      <SuperAdminSessionGuard />
      <SuperAdminShell>{children}</SuperAdminShell>
    </>
  );
}
