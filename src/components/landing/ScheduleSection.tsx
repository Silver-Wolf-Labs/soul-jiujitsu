import { createClient } from "@/lib/supabase/server";
import Schedule, { type EnrichedScheduleSlot } from "./Schedule";
import type { ScheduleSlot, ClassModality } from "@/lib/supabase/types";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

type SlotJoinRow = ScheduleSlot & {
  modality: { slug: string; name: string; color: string | null } | { slug: string; name: string; color: string | null }[] | null;
  level: { slug: string; name: string } | { slug: string; name: string }[] | null;
  slot_audiences: { audience: { name: string; kind: string; sort_order: number } | null }[] | null;
};

export default async function ScheduleSection({ sectionConfig }: Props) {
  const supabase = createClient();

  const [slotsRes, modalitiesRes] = await Promise.all([
    supabase
      .from("schedule_slots")
      .select(`
        *,
        modality:class_modalities!left(slug, name, color),
        level:class_levels!left(slug, name),
        slot_audiences:schedule_slot_audiences(
          audience:class_audiences!inner(name, kind, sort_order)
        )
      `)
      .eq("active", true)
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("class_modalities")
      .select("id, name, slug, color, active, sort_order, created_at, updated_at")
      .eq("active", true)
      .order("sort_order"),
  ]);

  const rows = (slotsRes.data ?? []) as SlotJoinRow[];
  const schedule: EnrichedScheduleSlot[] = rows.map((r) => {
    const modality = Array.isArray(r.modality) ? r.modality[0] : r.modality;
    const level    = Array.isArray(r.level)    ? r.level[0]    : r.level;
    const audiences = (r.slot_audiences ?? [])
      .map((j) => j.audience)
      .filter((a): a is NonNullable<typeof a> => !!a)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => a.name);
    return {
      ...r,
      modality_slug: modality?.slug ?? null,
      modality_name: modality?.name ?? null,
      modality_color: modality?.color ?? null,
      level_name: level?.name ?? null,
      audience_names: audiences,
    };
  });

  return (
    <Schedule
      schedule={schedule}
      modalityOptions={(modalitiesRes.data ?? []) as ClassModality[]}
      sectionConfig={sectionConfig}
    />
  );
}
