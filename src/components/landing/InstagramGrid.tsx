import { getGymProfile } from "@/lib/gym-profile";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

export default async function InstagramGrid({ sectionConfig }: Props) {
  const profile = await getGymProfile();
  const tag = sectionConfig?.display_subtitle ?? "Síguenos";
  const title =
    sectionConfig?.display_title ??
    (profile.social.instagramHandle || "Instagram");

  return (
    <section id="instagram" className="py-14 px-5 nav:px-12">
      <div className="inline-flex items-center gap-2 font-mono text-[13px] tracking-ultra uppercase text-blue-mid border-l-[3px] border-yellow pl-2.5 mb-4">
        {tag}
      </div>
      <h2 className="text-[clamp(40px,5.5vw,68px)] text-black leading-none mb-7">
        {title}
      </h2>

      {/* 6-cell placeholder grid — replace with EmbedSocial / LightWidget embed */}
      <div className="grid grid-cols-3 nav:grid-cols-6 gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-paper border border-line rounded-sm flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-line transition-colors duration-150"
          >
            <span className="text-xl opacity-25">📷</span>
            <span className="text-[10px] text-muted tracking-wider uppercase opacity-50">IG</span>
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-[13px] text-muted">
        Conecta el Instagram de la academia vía{" "}
        <a
          href="https://embedsocial.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-mid font-semibold hover:underline"
        >
          EmbedSocial
        </a>{" "}
        o{" "}
        <a
          href="https://lightwidget.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-mid font-semibold hover:underline"
        >
          LightWidget
        </a>{" "}
        para llenar esta galería automáticamente.
      </p>
    </section>
  );
}
