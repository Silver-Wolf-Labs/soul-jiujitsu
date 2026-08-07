import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { BELT_COLOR_MAP, TEAM_TYPE_CONFIG, BeltColor, TeamMemberType } from "@/lib/constants";
import { getInitials } from "@/lib/utils";
import Tag from "@/components/ui/Tag";
import SectionHeader from "@/components/ui/SectionHeader";
import CardScroller from "@/components/ui/CardScroller";
import type { TeamMember } from "@/lib/supabase/types";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

const FALLBACK_TEAM: TeamMember[] = [
  { id: 1, name: "Profesor Soul", role: "Profesor principal", belt: BeltColor.Black, bio: "Lidera cada clase con técnica, paciencia y respeto. Muy pronto conocerás aquí a todo el equipo.", photo_url: null, slug: "head-coach", order: 0, type: TeamMemberType.HeadCoach, active: true, visible_on_public_team: true, visible_until: null },
];

export default async function TeamGrid({ sectionConfig }: Props) {
  let team = FALLBACK_TEAM;

  try {
    const supabase = createClient();
    // Public team page shows members who are both:
    //   • active (hired / current staff)
    //   • visible_on_public_team (admin explicitly surfaced them —
    //     defaults true for staff, false for guests that admins must
    //     opt in)
    //   • not past their `visible_until` expiration (if set — used for
    //     time-bounded visiting coach displays)
    //
    // The `.or()` compares `visible_until` to the current ISO timestamp
    // so the expiration is enforced at render time without a cron.
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("team")
      .select("*")
      .eq("active", true)
      .eq("visible_on_public_team", true)
      .or(`visible_until.is.null,visible_until.gt.${nowIso}`)
      .order("order", { ascending: true });
    if (data && data.length > 0) team = data as TeamMember[];
  } catch {
    // Use fallback
  }

  return (
    <section id="team" className="py-14 px-5 nav:px-12">
      <SectionHeader
        tag={sectionConfig?.display_subtitle ?? "Profesores"}
        title={sectionConfig?.display_title ?? "El equipo"}
        subtitle="Las personas que hacen de Soul un espacio seguro para entrenar y crecer."
        className="mb-6"
      />

      <CardScroller cols={4} gap="gap-6">
        {team.map((member) => {
          const beltColor = BELT_COLOR_MAP[member.belt] ?? BELT_COLOR_MAP[BeltColor.Black];
          const tagCfg = TEAM_TYPE_CONFIG[member.type as TeamMemberType] ?? TEAM_TYPE_CONFIG[TeamMemberType.Instructor];
          const initials = getInitials(member.name);

          return (
            <Link key={member.id} href={`/team/${member.slug}`} className="no-underline">
              <div className="bg-white border border-line rounded-lg overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer h-full">
                {/* Image area */}
                <div className="h-[200px] bg-paper flex items-center justify-center relative overflow-hidden">
                  {member.photo_url ? (
                    <Image
                      src={member.photo_url}
                      alt={member.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-black flex items-center justify-center font-display text-[28px] text-white">
                      {initials}
                    </div>
                  )}
                  {/* Belt color bar */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-[6px]"
                    style={{ background: beltColor }}
                  />
                </div>

                {/* Body */}
                <div className="p-5">
                  <div className="text-base font-bold text-ink mb-0.5">{member.name}</div>
                  <div className="text-xs text-muted mb-2.5 font-mono tracking-[0.06em]">
                    {member.role}
                  </div>
                  <div className="text-[13px] text-muted leading-relaxed line-clamp-3">
                    {member.bio}
                  </div>
                  <Tag className={`mt-3 ${tagCfg.className}`}>{tagCfg.label}</Tag>
                </div>
              </div>
            </Link>
          );
        })}
      </CardScroller>
    </section>
  );
}
