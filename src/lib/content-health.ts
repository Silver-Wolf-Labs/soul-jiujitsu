import { createClient } from "@/lib/supabase/server";

export interface HealthCheck {
  id: string;
  label: string;
  detail: string;
  severity: "warning" | "error";
  fixHref: string;
}

export async function getContentHealth(): Promise<HealthCheck[]> {
  const supabase = createClient();
  const issues: HealthCheck[] = [];

  try {
    const [
      heroSettings,
      teamMembers,
      pricingPlans,
      banners,
      sections,
      blogPosts,
    ] = await Promise.all([
      supabase.from("site_settings").select("key,value").in("key", [
        "hero_eyebrow", "hero_sub_tagline",
      ]),
      supabase.from("team").select("id,name,photo_url,active").eq("active", true),
      supabase.from("pricing_plans").select("id,active"),
      supabase.from("banners").select("id,active,expires_at"),
      supabase.from("site_sections").select("id,key,visible"),
      supabase.from("blog_posts").select("id,published").limit(100),
    ]);

    // Hero checks
    const heroMap = new Map((heroSettings.data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    if (!heroMap.get("hero_eyebrow")) {
      issues.push({ id: "hero_eyebrow", label: "Hero eyebrow text is empty", detail: "Visitors see no gym identity text in the hero.", severity: "warning", fixHref: "/admin/hero" });
    }
    if (!heroMap.get("hero_sub_tagline")) {
      issues.push({ id: "hero_subtagline", label: "Hero sub-tagline is empty", detail: "The supporting copy beneath the headline is missing.", severity: "warning", fixHref: "/admin/hero" });
    }

    // Team checks
    const teamData = teamMembers.data ?? [];
    if (teamData.length === 0) {
      issues.push({ id: "team_empty", label: "No active team members", detail: "The Team section will show placeholder content.", severity: "error", fixHref: "/admin/team" });
    } else {
      const noPhoto = teamData.filter((m: { photo_url: string | null }) => !m.photo_url);
      if (noPhoto.length > 0) {
        issues.push({ id: "team_no_photo", label: `${noPhoto.length} team member(s) missing photos`, detail: "Members without photos show initials-only avatars.", severity: "warning", fixHref: "/admin/team" });
      }
    }

    // Pricing checks
    const activePlans = (pricingPlans.data ?? []).filter((p: { active: boolean }) => p.active);
    if (activePlans.length === 0) {
      issues.push({ id: "pricing_empty", label: "No active pricing plans", detail: "The Pricing section will show no plans to visitors.", severity: "error", fixHref: "/admin/pricing" });
    }

    // Banner checks (informational — not an error to have no banners)
    const now = new Date();
    const activeBanners = (banners.data ?? []).filter((b: { active: boolean; expires_at: string | null }) => b.active && (!b.expires_at || new Date(b.expires_at) > now));
    // No issue if 0 banners — intentional

    // Section checks
    const allSections = sections.data ?? [];
    const hiddenCount = allSections.filter((s: { visible: boolean }) => !s.visible).length;
    if (hiddenCount > 0) {
      issues.push({ id: "sections_hidden", label: `${hiddenCount} section(s) hidden from public site`, detail: "Hidden sections are not shown to visitors.", severity: "warning", fixHref: "/admin/sections" });
    }

    // Blog checks
    const blogData = blogPosts.data ?? [];
    const publishedCount = blogData.filter((p: { published: boolean }) => p.published).length;
    if (publishedCount === 0) {
      issues.push({ id: "blog_empty", label: "No published blog posts", detail: "The Blog section shows placeholder content.", severity: "warning", fixHref: "/admin/blog" });
    }

    void activeBanners; // suppress unused warning
  } catch {
    // Swallow errors — health check should never crash the dashboard
  }

  return issues;
}
