import { createClient } from "@/lib/supabase/server";
import { UpdateType } from "@/lib/constants";
import SectionHeader from "@/components/ui/SectionHeader";
import UpdatesFeedClient from "./UpdatesFeedClient";
import type { Update } from "@/lib/supabase/types";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

const FALLBACK_UPDATES: Update[] = [
  { id: 1, type: UpdateType.Alert, title: "6PM Gi Class Cancelled — Maintenance", body: "Thursday evening Gi class is cancelled due to facility maintenance. Academy reopens Friday 6am.", date: "2026-03-26", published: true, starts_at: null, expires_at: null, display_order: 1 },
  { id: 2, type: UpdateType.Event, title: "Guest Instructor Seminar — Save the Date", body: "Special 2-hour technique seminar coming soon. Space is limited.", date: "2026-04-12", published: true, starts_at: null, expires_at: null, display_order: 2 },
  { id: 3, type: UpdateType.Class, title: "Ladies-Only Gi Class Added Wednesdays", body: "Dedicated ladies Gi every Wednesday at 6pm.", date: "2026-04-07", published: true, starts_at: null, expires_at: null, display_order: 3 },
  { id: 4, type: UpdateType.News, title: "3 Competitors Medal at Latest Tournament", body: "Congrats to our team! Full results and photos posted inside.", date: "2026-03-18", published: true, starts_at: null, expires_at: null, display_order: 4 },
];

export default async function UpdatesFeed({ sectionConfig }: Props) {
  let updates = FALLBACK_UPDATES;
  let interval = 15;

  try {
    const supabase = createClient();
    const now = new Date().toISOString();
    const [{ data: uData }, { data: sData }] = await Promise.all([
      supabase
        .from("updates")
        .select("*")
        .eq("published", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .order("display_order", { ascending: true })
        .order("date", { ascending: false }),
      supabase
        .from("site_settings")
        .select("key,value")
        .eq("key", "updates_interval"),
    ]);
    if (uData && uData.length > 0) updates = uData as Update[];
    interval = parseInt(sData?.[0]?.value ?? "15", 10);
  } catch {
    // Use fallback
  }

  return (
    <section id="updates" className="py-10 px-5 nav:px-12">
      <div className="mb-10">
        <SectionHeader
          tag={sectionConfig?.display_subtitle ?? "Latest"}
          title={sectionConfig?.display_title ?? "News & Updates"}
        />
      </div>

      <UpdatesFeedClient updates={updates} interval={interval} />
    </section>
  );
}
