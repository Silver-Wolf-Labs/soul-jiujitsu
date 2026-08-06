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

  const eyebrow      = s.hero_eyebrow         ?? "";
  const subTagline   = s.hero_sub_tagline     ?? profile.tagline;
  const statLeftNum  = s.hero_stat_left_num   ?? "7×";
  const statLeftLbl  = s.hero_stat_left_label ?? "Days a Week";
  const statRightNum = s.hero_stat_right_num  ?? "15+";
  const statRightLbl = s.hero_stat_right_label ?? "Years Open";
  const statWideNum  = s.hero_stat_wide_num   ?? "";
  const statWideLbl  = s.hero_stat_wide_label  ?? "Classes offered";

  return (
    <section id="home" className="relative bg-white min-h-[88vh] flex items-center overflow-hidden border-b border-line">
      {/* Grid pattern background */}
      <div className="absolute inset-0 bg-grid-pattern" />

      {/* Theme accent bar — reflects the active palette */}
      <div className="absolute left-0 top-0 bottom-0 w-[5px] flex flex-col">
        <div className="flex-1 bg-yellow" />
        <div className="flex-1 bg-blue" />
        <div className="flex-1 bg-purple" />
        <div className="flex-1 bg-brown" />
        <div className="flex-1 bg-black" />
      </div>

      {/* Ghost BJJ text */}
      <div
        className="absolute right-[-20px] top-1/2 -translate-y-1/2 font-display text-[clamp(180px,22vw,300px)] text-black/[0.04] leading-none pointer-events-none select-none whitespace-nowrap"
        aria-hidden
      >
        BJJ
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-6 py-16 nav:px-16 nav:py-20 grid grid-cols-1 nav:grid-cols-[1fr_auto] items-center gap-12 nav:gap-16">
        {/* Left */}
        <div>
          {/* Eyebrow */}
          <div className="flex items-center gap-3 font-mono text-[11px] tracking-ultra uppercase text-muted mb-5">
            <span className="w-7 h-px bg-line-dark" />
            {eyebrow}
          </div>

          {/* Headline */}
          <h1 className="font-display text-[clamp(64px,9vw,120px)] leading-[0.92] text-black mb-7">
            Train.
            <br />
            <em className="not-italic text-yellow [-webkit-text-stroke:2px_black]">
              Improve.
            </em>
            <br />
            Belong.
          </h1>

          <p className="text-base text-muted max-w-[420px] mb-10 leading-relaxed">
            {subTagline}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button variant="yellow" href="#pricing">
              Start Free Trial
            </Button>
            <Button variant="ghost" href="#schedule">
              View Schedule
            </Button>
          </div>
        </div>

        {/* Right — stat grid (hidden on mobile) */}
        <div className="hidden nav:block">
          <div className="grid grid-cols-2 gap-px bg-line border border-line rounded-lg overflow-hidden min-w-[280px]">
            {/* Left stat — normal */}
            <div className="p-6 px-7 bg-white">
              <div className="font-display text-[52px] leading-none text-black">{statLeftNum}</div>
              <div className="text-[11px] tracking-[0.1em] uppercase mt-0.5 text-muted">{statLeftLbl}</div>
            </div>

            {/* Right stat — accent */}
            <div className="p-6 px-7 bg-black">
              <div className="font-display text-[52px] leading-none text-yellow">{statRightNum}</div>
              <div className="text-[11px] tracking-[0.1em] uppercase mt-0.5 text-white/40">{statRightLbl}</div>
            </div>

            {/* Wide stat */}
            <div className="col-span-2 bg-off-white border-t border-line flex items-center justify-between px-7 py-4">
              <div className="text-xs text-muted">{statWideLbl}</div>
              <div className="text-[18px] font-semibold text-ink">{statWideNum}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
