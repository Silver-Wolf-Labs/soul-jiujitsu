import { createClient } from "@/lib/supabase/server";
import AlertBannerClient from "./AlertBannerClient";
import type { Banner } from "@/lib/supabase/types";

export default async function AlertBanner() {
  try {
    const supabase = createClient();
    const now = new Date().toISOString();

    const [{ data: banners }, { data: settings }] = await Promise.all([
      supabase
        .from("banners")
        .select("*")
        .eq("active", true)
        .eq("section", "top")
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .order("display_order")
        .limit(3),
      supabase
        .from("site_settings")
        .select("key,value")
        .eq("key", "banner_interval"),
    ]);

    const interval = parseInt(settings?.[0]?.value ?? "5", 10);
    const activeBanners = (banners as Banner[]) ?? [];

    if (!activeBanners.length) return null;
    return <AlertBannerClient banners={activeBanners} interval={interval} />;
  } catch {
    return null;
  }
}
