import Image from "next/image";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getGymProfile } from "@/lib/gym-profile";

const HERO_KEYS = [
  "hero_eyebrow",
  "hero_sub_tagline",
  "hero_stat_left_num",
  "hero_stat_left_label",
  "hero_stat_right_num",
  "hero_stat_right_label",
  "hero_stat_wide_num",
  "hero_stat_wide_label",
] as const;

async function getHeroSettings(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("site_settings")
      .select("key,value")
      .in("key", [...HERO_KEYS]);
    return Object.fromEntries(
      (data ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
    );
  } catch {
    return {};
  }
}

export default async function Jumbotron() {
  const [s, profile] = await Promise.all([getHeroSettings(), getGymProfile()]);

  const eyebrow      = s.hero_eyebrow          ?? "San Diego · Cartago · Costa Rica";
  const subTagline   = s.hero_sub_tagline      ?? profile.tagline;
  const statLeftNum  = s.hero_stat_left_num    ?? "12+";
  const statLeftLbl  = s.hero_stat_left_label  ?? "Clases por semana";
  const statRightNum = s.hero_stat_right_num   ?? "6";
  const statRightLbl = s.hero_stat_right_label ?? "Días a la semana";
  const statWideNum  = s.hero_stat_wide_num    ?? "Gi · No-Gi · Kids · Open Mat";
  const statWideLbl  = s.hero_stat_wide_label  ?? "Modalidades";

  return (
    <section id="home" className="relative bg-soul-dark min-h-[92vh] flex items-center overflow-hidden">
      {/* Theme accent bar — primary / info / accent / warm / dark */}
      <div className="absolute left-0 top-0 bottom-0 w-[5px] flex flex-col z-10">
        <div className="flex-1 bg-yellow" />
        <div className="flex-1 bg-blue" />
        <div className="flex-1 bg-purple" />
        <div className="flex-1 bg-brown" />
        <div className="flex-1 bg-black" />
      </div>

      {/* Ghost wordmark */}
      <div
        className="absolute right-[-30px] bottom-[-40px] font-display font-soul text-[clamp(160px,22vw,320px)] leading-none text-white/[0.03] pointer-events-none select-none whitespace-nowrap"
        aria-hidden
      >
        SOUL
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-6 py-16 nav:px-16 nav:py-20 grid grid-cols-1 nav:grid-cols-[1.05fr_0.95fr] items-center gap-14 nav:gap-16">
        {/* Left */}
        <div>
          {/* Eyebrow */}
          <div className="flex items-center gap-3 font-mono text-[11px] tracking-ultra uppercase text-yellow mb-6">
            <span className="w-7 h-px bg-yellow opacity-60" />
            {eyebrow}
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(48px,7.5vw,92px)] leading-[1.02] text-off-white mb-7">
            Jiu jitsu
            <br />
            <em className="text-soul-gold font-soul">para el alma.</em>
          </h1>

          <p className="text-base text-white/55 max-w-[460px] mb-10 leading-relaxed">
            {subTagline}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button variant="yellow" href="/join">
              Empieza hoy
            </Button>
            <Button variant="ghost-dark" href="#schedule">
              Ver horarios
            </Button>
          </div>

          <p className="mt-8 font-mono text-[11px] tracking-[0.14em] uppercase text-white/30">
            Respeto · Disciplina · Coraje · Templanza
          </p>
        </div>

        {/* Right — jungle art + stats */}
        <div className="max-w-[440px] w-full mx-auto nav:mx-0 nav:justify-self-end">
          <div className="relative rounded-lg overflow-hidden border border-[#e6b323]/30 shadow-[0_24px_90px_-20px_rgba(230,179,35,0.35)]">
            <div className="relative aspect-[4/5]">
              <Image
                src="/brand/jungle.jpg"
                alt="Soul Jiu Jitsu — letras doradas entre la selva y una catarata"
                fill
                priority
                sizes="(max-width: 900px) 90vw, 440px"
                className="object-cover object-[50%_38%]"
              />
            </div>
            {/* Blend the art into the dark canvas */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#14110a]/70 via-transparent to-[#14110a]/25 pointer-events-none" />
          </div>

          {/* Stats */}
          <div className="relative -mt-10 mx-4 grid grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
            <div className="p-5 px-6 bg-[#181409]/95">
              <div className="font-display font-soul text-[42px] leading-none text-soul-gold">{statLeftNum}</div>
              <div className="text-[10.5px] tracking-[0.1em] uppercase mt-1.5 text-white/45">{statLeftLbl}</div>
            </div>
            <div className="p-5 px-6 bg-[#181409]/95">
              <div className="font-display font-soul text-[42px] leading-none text-off-white">{statRightNum}</div>
              <div className="text-[10.5px] tracking-[0.1em] uppercase mt-1.5 text-white/45">{statRightLbl}</div>
            </div>
            <div className="col-span-2 bg-[#100d06]/95 border-t border-white/10 flex items-center justify-between gap-3 px-6 py-3.5">
              <div className="text-[11px] uppercase tracking-[0.1em] text-white/40">{statWideLbl}</div>
              <div className="text-[13px] font-semibold text-yellow whitespace-nowrap">{statWideNum}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
