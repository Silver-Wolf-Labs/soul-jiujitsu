export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { BELT_COLOR_MAP, TEAM_TYPE_CONFIG, BeltColor, TeamMemberType } from "@/lib/constants";
import { getInitials } from "@/lib/utils";
import Tag from "@/components/ui/Tag";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import type { TeamMember } from "@/lib/supabase/types";

// Fallback data for when Supabase isn't connected
const FALLBACK_TEAM: TeamMember[] = [
  { id: 1, name: "Head Coach", role: "Head Instructor", belt: BeltColor.Black, bio: "Add your team via the admin panel.", photo_url: null, slug: "head-coach", order: 0, type: TeamMemberType.HeadCoach, active: true, visible_on_public_team: true, visible_until: null },
];

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let member: TeamMember | null = null;

  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("team")
      .select("*")
      .eq("slug", slug)
      .single();
    if (data) member = data as TeamMember;
  } catch {
    member = FALLBACK_TEAM.find((m) => m.slug === slug) ?? null;
  }

  // 404 when the slug exists but shouldn't be public — matches the
  // grid's filter so a hidden member can't be reached by direct URL.
  if (!member) notFound();
  if (!member.active || !member.visible_on_public_team) notFound();
  if (member.visible_until && new Date(member.visible_until) < new Date()) notFound();

  const beltColor = BELT_COLOR_MAP[member.belt] ?? BELT_COLOR_MAP[BeltColor.Black];
  const tagCfg = TEAM_TYPE_CONFIG[member.type as TeamMemberType] ?? TEAM_TYPE_CONFIG[TeamMemberType.Instructor];
  const initials = getInitials(member.name);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        {/* Back link */}
        <div className="px-5 nav:px-12 pt-10">
          <Link
            href="/#team"
            className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />Back to Team
          </Link>
        </div>

        {/* Profile hero */}
        <div className="px-5 nav:px-12 py-12">
          <div className="max-w-3xl">
            <div className="flex flex-col sm:flex-row gap-8 items-start">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-32 h-32 rounded-lg bg-paper flex items-center justify-center overflow-hidden relative">
                  {member.photo_url ? (
                    <Image
                      src={member.photo_url}
                      alt={member.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <span className="font-display text-[48px] text-white bg-black w-full h-full flex items-center justify-center">
                      {initials}
                    </span>
                  )}
                </div>
                {/* Belt stripe */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-[5px] rounded-b-lg"
                  style={{ background: beltColor }}
                />
              </div>

              {/* Info */}
              <div className="flex-1">
                <Tag className={`mb-3 ${tagCfg.className}`}>{tagCfg.label}</Tag>
                <h1 className="font-display text-[clamp(40px,6vw,72px)] text-black leading-none mb-2">
                  {member.name}
                </h1>
                <p className="font-mono text-sm text-muted tracking-[0.06em]">
                  {member.role}
                </p>
              </div>
            </div>

            {/* Belt color bar */}
            <div
              className="mt-10 mb-8 h-[5px] w-24 rounded-full"
              style={{ background: beltColor }}
            />

            {/* Bio */}
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl text-black mb-4">About</h2>
              <p className="text-[16px] text-muted leading-relaxed">{member.bio}</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
