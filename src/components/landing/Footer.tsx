import Link from "next/link";
import { NAV_LINKS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { getGymProfile } from "@/lib/gym-profile";

const FALLBACK_INFO_LINKS = [
  { label: "FAQ",       href: "#faq" },
  { label: "Contact",   href: "#contact" },
  { label: "Subscribe", href: "#subscribe" },
  { label: "Waiver",    href: "#" },
];

async function getFooterLinks() {
  const fallback = {
    site: NAV_LINKS.map(({ label, href }) => ({ label, href })),
    info: FALLBACK_INFO_LINKS,
  };
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("footer_items")
      .select("label,href,group_name")
      .eq("active", true)
      .order("display_order");
    if (!data || data.length === 0) return fallback;
    const siteLinks = data
      .filter((r: { group_name: string }) => r.group_name === "Site")
      .map(({ label, href }: { label: string; href: string }) => ({ label, href }));
    const infoLinks = data
      .filter((r: { group_name: string }) => r.group_name === "Info")
      .map(({ label, href }: { label: string; href: string }) => ({ label, href }));
    return {
      site: siteLinks.length > 0 ? siteLinks : fallback.site,
      info: infoLinks.length > 0 ? infoLinks : fallback.info,
    };
  } catch {
    return fallback;
  }
}

export default async function Footer() {
  const [profile, footerLinks] = await Promise.all([
    getGymProfile(),
    getFooterLinks(),
  ]);
  const contact = profile.contact;
  const phoneHref = contact.phoneHref;

  return (
    <footer className="bg-black text-white/50 pt-16 pb-8 px-5 nav:px-12">
      <div className="grid grid-cols-2 nav:grid-cols-[2fr_1fr_1fr] gap-12 mb-12">
        {/* Brand */}
        <div className="col-span-2 nav:col-span-1">
          <div className="font-display text-2xl text-white mb-3 flex items-center gap-1.5">
            {profile.logoText}{" "}
            <span className="text-yellow">{profile.logoDot}</span>{" "}
            {profile.cityName}
          </div>
          <p className="text-[13px] text-white/35 leading-relaxed max-w-[220px] mb-6">
            {profile.affiliateText}
          </p>
          <div className="flex flex-wrap gap-2">
            {profile.footerTags.map((b) => (
              <span
                key={b}
                className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-[11px] text-white/40"
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* Site links */}
        <div>
          <h4 className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/30 mb-4">
            Site
          </h4>
          {footerLinks.site.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="block text-[13px] text-white/50 hover:text-white transition-colors duration-150 mb-2.5"
            >
              {label}
            </Link>
          ))}
          {footerLinks.info
            .filter(({ label }) => !["Contact"].includes(label))
            .map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="block text-[13px] text-white/50 hover:text-white transition-colors duration-150 mb-2.5"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Connect */}
        <div>
          <h4 className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/30 mb-4">
            Connect
          </h4>
          <a
            href={profile.social.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[13px] text-white/50 hover:text-white transition-colors duration-150 mb-2.5"
          >
            Instagram
          </a>
          <a
            href={phoneHref}
            className="block text-[13px] text-white/50 hover:text-white transition-colors duration-150 mb-2.5"
          >
            {contact.phone}
          </a>
          <a
            href={`mailto:${contact.email}`}
            className="block text-[13px] text-white/50 hover:text-white transition-colors duration-150 mb-2.5"
          >
            Email Us
          </a>
          <Link
            href="#contact"
            className="block text-[13px] text-white/50 hover:text-white transition-colors duration-150 mb-2.5"
          >
            Contact Form
          </Link>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06] pt-6 flex flex-col nav:flex-row justify-between items-start nav:items-center gap-3 text-xs text-white/30 flex-wrap">
        <span>© {new Date().getFullYear()} {profile.gymName}</span>
        <span className="flex items-center gap-4">
          <Link href="/privacy" className="text-white/30 hover:text-white/70 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="text-white/30 hover:text-white/70 transition-colors">
            Terms
          </Link>
        </span>
        <span>
          {contact.address},{" "}
          {contact.city} {contact.state}{" "}
          {contact.zip}
        </span>
      </div>
    </footer>
  );
}
