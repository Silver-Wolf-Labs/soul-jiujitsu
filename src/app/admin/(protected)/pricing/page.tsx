import { redirect } from "next/navigation";

// The public Pricing section now reads directly from membership_plans.
// This page has been consolidated into /admin/membership-plans.
export default function AdminPricingPage() {
  redirect("/admin/membership-plans");
}
