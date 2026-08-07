import { createClient } from "@/lib/supabase/server";
import { Check } from "lucide-react";
import AlertBannerClient from "./AlertBannerClient";
import CardScroller from "@/components/ui/CardScroller";
import {
  HIGHLIGHT_BG_CLASS,
  HIGHLIGHT_TEXT_COLOR,
  HIGHLIGHT_BORDER_HEX,
} from "@/lib/pricing-colors";
import type { MembershipPlan, Banner } from "@/lib/supabase/types";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

function formatPeriod(plan: MembershipPlan): string {
  if (plan.period_display) return plan.period_display;
  if (plan.billing_interval === "month") return "/mes";
  if (plan.billing_interval === "year")  return "/año";
  return "pago único";
}

/** ₡ amounts with dot thousand separators — 4000000 cents → "40.000" */
function formatColones(cents: number): string {
  return Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export default async function Pricing({ sectionConfig }: Props) {
  let plans: MembershipPlan[] = [];
  let pricingBanners: Banner[] = [];
  let bannerInterval = 10;

  const supabase = createClient();
  const now = new Date().toISOString();
  const [{ data: pData }, { data: bData }, { data: sData }] = await Promise.all([
    supabase
      .from("membership_plans")
      .select("*")
      .eq("status", "active")
      .eq("visible", true)
      .order("display_order"),
    supabase
      .from("banners")
      .select("*")
      .eq("active", true)
      .eq("section", "pricing")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .order("display_order")
      .limit(5),
    supabase.from("site_settings").select("key,value").eq("key", "banner_interval"),
  ]);
  plans = (pData ?? []).map(p => ({ ...p, features: (p.features as string[]) ?? [] })) as MembershipPlan[];
  pricingBanners = (bData ?? []) as Banner[];
  bannerInterval = parseInt(sData?.[0]?.value ?? "10", 10);

  return (
    <section id="pricing" className="py-14 px-5 nav:px-12">
      <div className="inline-flex items-center gap-2 font-mono text-[13px] tracking-ultra uppercase text-blue-mid border-l-[3px] border-yellow pl-2.5 mb-4">
        {sectionConfig?.display_subtitle ?? "Membresías"}
      </div>
      <h2 className="text-[clamp(40px,5.5vw,68px)] text-black leading-none mb-2">
        {sectionConfig?.display_title ?? "Planes"}
      </h2>
      <p className="text-[15px] text-muted mb-6 max-w-[560px] leading-relaxed">
        Planes mensuales y flexibles, sin contratos. ¿Buscas algo más
        personalizado? Consulta por clases privadas.
      </p>

      <CardScroller
        cols={4}
        gap="gap-4"
        defaultIndex={plans.findIndex(p => p.highlight_color || p.highlight)}
        alwaysCarousel={plans.length >= 5}
      >
        {plans.map(plan => {
          const color = plan.highlight_color ?? null;
          const borderStyle = color
            ? { border: `2px solid ${HIGHLIGHT_BORDER_HEX[color]}` }
            : plan.highlight
            ? { border: "2px solid var(--color-ink)" }
            : { border: "1px solid var(--color-line)" };
          const badgeBgClass = color ? HIGHLIGHT_BG_CLASS[color] : "bg-black";
          const badgeTextClass = color ? HIGHLIGHT_TEXT_COLOR[color] : "text-white";
          const showBadge = !!(color || plan.highlight);
          return (
          <div
            key={plan.id}
            className="relative h-full flex flex-col bg-white rounded-lg p-8 transition-shadow duration-200 hover:shadow-xl"
            style={borderStyle}
          >
            {showBadge && (
              <div className={`absolute -top-[13px] left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-[0.1em] uppercase px-3.5 py-1 rounded-full whitespace-nowrap ${badgeBgClass} ${badgeTextClass}`}>
                {plan.highlight_label || "Destacado"}
              </div>
            )}
            <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-muted mb-4">
              {plan.name}
            </div>
            <div className="font-display font-soul text-[clamp(34px,2.9vw,44px)] leading-none text-ink whitespace-nowrap">
              <sup className="text-[0.5em] align-top mr-0.5">₡</sup>
              {formatColones(plan.price_cents)}
            </div>
            <div className="text-[13px] text-muted mb-6">{formatPeriod(plan)}</div>
            <ul className="mb-7 space-y-0 flex-1">
              {plan.features.map(f => (
                <li key={f} className="text-[13px] text-muted py-2 border-b border-line flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-blue-mid mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={plan.cta_href}
              className={`mt-auto block text-center py-2.5 rounded text-[12px] font-bold tracking-wider uppercase transition-all duration-150 border ${
                showBadge
                  ? "bg-yellow text-black border-yellow hover:bg-yellow-mid"
                  : "bg-white text-ink border-line hover:border-black hover:bg-black hover:text-white"
              }`}
            >
              {plan.cta_label || "Inscribirme"}
            </a>
          </div>
          );
        })}
      </CardScroller>

      {pricingBanners.length > 0 && (
        <div className="mt-8 rounded-lg overflow-hidden">
          <AlertBannerClient banners={pricingBanners} interval={bannerInterval} />
        </div>
      )}
    </section>
  );
}
