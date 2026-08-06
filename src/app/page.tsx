import React from "react";
import { createClient } from "@/lib/supabase/server";
import AlertBanner from "@/components/landing/AlertBanner";
import Navbar from "@/components/landing/Navbar";
import Jumbotron from "@/components/landing/Jumbotron";
import BeltDivider from "@/components/landing/BeltDivider";
import UpdatesFeed from "@/components/landing/UpdatesFeed";
import ScheduleSection from "@/components/landing/ScheduleSection";
import TeamGrid from "@/components/landing/TeamGrid";
import BlogPreview from "@/components/landing/BlogPreview";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import InstagramGrid from "@/components/landing/InstagramGrid";
import SubscribeForm from "@/components/landing/SubscribeForm";
import LocationContact from "@/components/landing/LocationContact";
import Footer from "@/components/landing/Footer";
import type { SiteSection } from "@/lib/supabase/types";

const DEFAULT_SECTIONS = ["updates","schedule","team","blog","pricing","faq","instagram","subscribe","contact"];

type SectionConfig = Pick<SiteSection, "key" | "display_title" | "display_subtitle">;

async function getSections(): Promise<{ order: string[]; configs: Record<string, SectionConfig> }> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("site_sections")
      .select("key,display_order,visible,display_title,display_subtitle")
      .order("display_order");

    if (data && data.length > 0) {
      const rows = data as (SiteSection & { visible: boolean })[];
      const configs: Record<string, SectionConfig> = {};
      rows.forEach((r) => { configs[r.key] = r; });
      const order = rows.filter((r) => r.visible).map((r) => r.key);
      return { order, configs };
    }
  } catch {}
  return { order: DEFAULT_SECTIONS, configs: {} };
}

export default async function HomePage() {
  const { order, configs } = await getSections();

  function section(key: string) {
    return configs[key] ?? { key, display_title: null, display_subtitle: null };
  }

  const SECTION_MAP: Record<string, React.ReactElement> = {
    updates:   <UpdatesFeed   sectionConfig={section("updates")} />,
    schedule:  <ScheduleSection sectionConfig={section("schedule")} />,
    team:      <TeamGrid      sectionConfig={section("team")} />,
    blog:      <BlogPreview   sectionConfig={section("blog")} />,
    pricing:   <Pricing       sectionConfig={section("pricing")} />,
    faq:       <FAQ           sectionConfig={section("faq")} />,
    instagram: <InstagramGrid sectionConfig={section("instagram")} />,
    subscribe: <SubscribeForm sectionConfig={section("subscribe")} />,
    contact:   <LocationContact />,
  };

  return (
    <>
      <AlertBanner />
      <Navbar />
      <main>
        <Jumbotron />
        <BeltDivider />
        {order.map((key) => {
          const el = SECTION_MAP[key];
          return el ? <div key={key}>{el}</div> : null;
        })}
      </main>
      <Footer />
    </>
  );
}
