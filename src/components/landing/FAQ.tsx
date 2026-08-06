import { createClient } from "@/lib/supabase/server";
import { FAQ_ITEMS } from "@/lib/constants";
import FAQClient from "./FAQClient";
import SectionHeader from "@/components/ui/SectionHeader";
import type { FAQItem } from "@/lib/supabase/types";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

export default async function FAQ({ sectionConfig }: Props) {
  let items: FAQItem[] = [];

  try {
    const supabase = createClient();
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("faq_items")
      .select("*")
      .eq("active", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .order("display_order");
    if (data && data.length > 0) items = data as FAQItem[];
  } catch {
    // fall through to constants fallback
  }

  // Fallback to constants if DB has no items
  const faqData = items.length > 0
    ? items.map((i) => ({ question: i.question, answer: i.answer }))
    : FAQ_ITEMS.map((i) => ({ question: i.question, answer: i.answer }));

  return (
    <section id="faq" className="py-10 px-5 nav:px-12">
      <SectionHeader
        tag={sectionConfig?.display_subtitle ?? "Questions"}
        title={sectionConfig?.display_title ?? "FAQ"}
        className="mb-6"
      />
      <div className="max-w-[760px]">
        <FAQClient items={faqData} />
      </div>
    </section>
  );
}
