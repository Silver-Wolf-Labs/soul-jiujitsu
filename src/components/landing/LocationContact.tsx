import { createClient } from "@/lib/supabase/server";
import { MapPin, Phone, Mail, Clock, ArrowUpRight } from "lucide-react";
import { getGymProfile } from "@/lib/gym-profile";
import ContactForm from "./ContactForm";
import SectionHeader from "@/components/ui/SectionHeader";

interface HourRow { days: string; hours: string; }

interface LocationData {
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  hours: HourRow[];
  mapEmbed: string;
  displayTitle: string;
  displaySubtitle: string;
}

async function getLocationData(): Promise<LocationData> {
  const profile = await getGymProfile();
  const defaults: LocationData = {
    address: profile.contact.address,
    city: profile.contact.city,
    state: profile.contact.state,
    zip: profile.contact.zip,
    phone: profile.contact.phone,
    email: profile.contact.email,
    hours: [],
    mapEmbed: "",
    displayTitle: "Location & Contact",
    displaySubtitle: "Find Us & Reach Out",
  };

  try {
    const supabase = createClient();
    const [{ data: settings }, { data: section }] = await Promise.all([
      supabase.from("site_settings").select("key,value").in("key", [
        "contact_address", "contact_city", "contact_state", "contact_zip",
        "contact_phone", "contact_email", "contact_hours", "contact_map_embed",
      ]),
      supabase.from("site_sections").select("display_title,display_subtitle").eq("key", "contact").single(),
    ]);

    if (settings) {
      const get = (k: string) => (settings as { key: string; value: string }[]).find((r) => r.key === k)?.value;
      if (get("contact_address")) defaults.address = get("contact_address")!;
      if (get("contact_city")) defaults.city = get("contact_city")!;
      if (get("contact_state")) defaults.state = get("contact_state")!;
      if (get("contact_zip")) defaults.zip = get("contact_zip")!;
      if (get("contact_phone")) defaults.phone = get("contact_phone")!;
      if (get("contact_email")) defaults.email = get("contact_email")!;
      if (get("contact_map_embed")) defaults.mapEmbed = get("contact_map_embed")!;
      const hoursRaw = get("contact_hours");
      if (hoursRaw) {
        try { defaults.hours = JSON.parse(hoursRaw); } catch { /* keep default */ }
      }
    }

    if (section) {
      const s = section as { display_title: string | null; display_subtitle: string | null };
      if (s.display_title) defaults.displayTitle = s.display_title;
      if (s.display_subtitle) defaults.displaySubtitle = s.display_subtitle;
    }
  } catch { /* use defaults */ }

  return defaults;
}

export default async function LocationContact() {
  const loc = await getLocationData();

  const fullAddress = `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
  const mapsNavHref = `https://maps.google.com/maps?daddr=${encodeURIComponent(fullAddress)}`;
  const phoneHref = `tel:${loc.phone.replace(/\D/g, "")}`;

  return (
    <section id="contact" className="py-10 px-5 nav:px-12">
      <SectionHeader tag={loc.displaySubtitle} title={loc.displayTitle} className="mb-6" />

      <div className="grid grid-cols-1 nav:grid-cols-2 gap-10 items-start">
        {/* Location pocket */}
        <div className="bg-white border border-line rounded-lg overflow-hidden">
          {/* Map embed — near-square aspect ratio */}
          <div className="relative w-full" style={{ paddingBottom: "80%" }}>
            <iframe
              src={loc.mapEmbed}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Gym location"
            />
          </div>

          {/* Details */}
          <div className="divide-y divide-line">
            {/* Address — tappable, opens navigation */}
            <a
              href={mapsNavHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 items-start px-5 py-3.5 hover:bg-off-white transition-colors group"
            >
              <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5 text-muted">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-muted font-semibold tracking-[0.06em] uppercase mb-1">Address</div>
                <div className="text-[14px] text-ink group-hover:text-blue-mid transition-colors">
                  {loc.address}<br />
                  {loc.city}, {loc.state} {loc.zip}
                </div>
                <div className="text-[11px] text-muted mt-1 inline-flex items-center gap-0.5">Tap to get directions <ArrowUpRight className="w-3 h-3" /></div>
              </div>
            </a>

            {/* Phone */}
            <div className="flex gap-3 items-center px-5 py-3.5">
              <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-muted">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-muted font-semibold tracking-[0.06em] uppercase mb-0.5">Phone</div>
                <a href={phoneHref} className="text-[14px] text-blue-mid">
                  {loc.phone}
                </a>
              </div>
            </div>

            {/* Email */}
            <div className="flex gap-3 items-center px-5 py-3.5">
              <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-muted">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-muted font-semibold tracking-[0.06em] uppercase mb-0.5">Email</div>
                <a href={`mailto:${loc.email}`} className="text-[14px] text-blue-mid">
                  {loc.email}
                </a>
              </div>
            </div>

            {/* Hours */}
            <div className="flex gap-3 items-start px-5 py-3.5">
              <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5 text-muted">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-muted font-semibold tracking-[0.06em] uppercase mb-1">Hours</div>
                <div className="text-[13px] text-muted leading-[1.9]">
                  {loc.hours.map((h) => (
                    <span key={h.days} className="block">
                      <span className="text-ink font-medium">{h.days}:</span> {h.hours}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact form */}
        <ContactForm />
      </div>
    </section>
  );
}
