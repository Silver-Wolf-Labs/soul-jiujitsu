import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, COOKIE_NAME } from "./auth";

/**
 * Server-side guard for super admin pages.
 * Call at the top of any server component or layout that requires super admin access.
 * Redirects to /super-admin/login if the token is missing or invalid.
 */
export async function requireSuperAdmin(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token || !(await verifyToken(token))) {
    redirect("/super-admin/login");
  }
}
