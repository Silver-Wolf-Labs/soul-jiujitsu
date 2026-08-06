"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

/**
 * A single instructor assignment on a class.
 *
 *   - `{ instructor_id: 3 }`           → reuse existing instructor.
 *   - `{ name: "JC" }`                 → ad-hoc stub; a new `instructors`
 *                                         row is created lazily (no
 *                                         team_member_id, no auth).
 *
 * Both pointers can be provided together (id wins; name is treated as a
 * label hint during creation).
 */
export type ScheduleInstructorAssignment = {
  instructor_id?: number | null;
  name?: string | null;
};

/**
 * Post-WS3 payload shape. The legacy scalar `discipline` / `level` (text)
 * / `category` / `min_age` / `max_age` / `allowed_gender` / `invite_only`
 * / `audience_note` fields have been replaced by the four dimensional ids
 * + arrays that feed `create_schedule_slot_tx` / `update_schedule_slot_tx`.
 * Those columns still exist on the table (dropped in Phase 3 migration
 * 20240168) but the write path no longer touches them — the RPC writes
 * only the new surface and the junctions.
 */
export type ScheduleSlotPayload = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  title: string;
  /** Required post-WS3. The RPC throws if NULL. */
  modality_id: number;
  level_id?: number | null;
  focus_ids?: number[];
  audience_ids?: number[];
  area?: string | null;
  /** Primary instructor's display name — scalar mirror. Normally derived
   *  from `instructors[0]`; passed through only for legacy callers. */
  instructor_name?: string | null;
  show_instructor?: boolean;
  instructor_name_display?: "full" | "first_only" | "last_only";
  link_label?: string | null;
  link_url?: string | null;
  sort_order?: number;
  active?: boolean;
  /** Multi-instructor list, primary first. Empty/omitted = no instructor. */
  instructors?: ScheduleInstructorAssignment[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * For each assignment, return a resolved {instructor_id, name} pair.
 * Creates a new `instructors` row for assignments that carry only a name
 * and don't match any existing slug. Assignments with neither id nor name
 * are dropped (defensive; shouldn't happen from the UI).
 */
async function resolveAssignments(
  supabase: ReturnType<typeof createClient>,
  raw: ScheduleInstructorAssignment[] | undefined,
): Promise<{ instructor_id: number; name: string }[]> {
  if (!raw || raw.length === 0) return [];

  const out: { instructor_id: number; name: string }[] = [];
  for (const a of raw) {
    if (a.instructor_id) {
      const { data } = await supabase
        .from("instructors")
        .select("id, name")
        .eq("id", a.instructor_id)
        .maybeSingle();
      if (data) out.push({ instructor_id: data.id as number, name: data.name as string });
      continue;
    }
    const name = (a.name ?? "").trim();
    if (name.length === 0) continue;

    const slug = slugify(name);
    const { data: existing } = await supabase
      .from("instructors")
      .select("id, name")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      out.push({ instructor_id: existing.id as number, name: existing.name as string });
      continue;
    }
    const { data: created, error } = await supabase
      .from("instructors")
      .insert({ name, slug, active: true })
      .select("id, name")
      .single();
    if (error) throw new Error(`Failed to create instructor "${name}": ${error.message}`);
    out.push({ instructor_id: created.id as number, name: created.name as string });
  }
  return out;
}

/**
 * Replace the `schedule_slot_instructors` rows for a slot with the given
 * assignments (primary = index 0). Also mirrors the primary onto the
 * scalar `schedule_slots.instructor_id` + `instructor_name` for backward
 * compatibility with existing read paths.
 */
async function syncSlotInstructors(
  supabase: ReturnType<typeof createClient>,
  slotId: number,
  assignments: { instructor_id: number; name: string }[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from("schedule_slot_instructors")
    .delete()
    .eq("schedule_slot_id", slotId);
  if (delErr) throw new Error(`slot instructors delete: ${delErr.message}`);

  if (assignments.length > 0) {
    const rows = assignments.map((a, i) => ({
      schedule_slot_id: slotId,
      instructor_id: a.instructor_id,
      sort_order: i,
    }));
    const { error: insErr } = await supabase.from("schedule_slot_instructors").insert(rows);
    if (insErr) throw new Error(`slot instructors insert: ${insErr.message}`);
  }

  const primary = assignments[0];
  const { error: mirrorErr } = await supabase
    .from("schedule_slots")
    .update({
      instructor_id: primary?.instructor_id ?? null,
      instructor_name: primary?.name ?? null,
    })
    .eq("id", slotId);
  if (mirrorErr) throw new Error(`slot scalar mirror: ${mirrorErr.message}`);
}

// ─── Server actions ──────────────────────────────────────────────────────────

export async function createScheduleEntry(data: ScheduleSlotPayload): Promise<void> {
  await requireAdmin();

  // Resolve instructors against the anon client first (we keep the
  // existing behavior where stub resolution runs before the slot is
  // written, so a bad assignment never leaves a teacherless slot).
  const supabase = createClient();
  const assignments = await resolveAssignments(supabase, data.instructors);

  // The RPC is granted EXECUTE to service_role only — matches the
  // belt_history_tx / member_profile_tx pattern. `requireAdmin()` above
  // is the authorization gate.
  const svc = createServiceClient();
  const { data: slotId, error } = await svc.rpc("create_schedule_slot_tx", {
    p_day_of_week:              data.day_of_week,
    p_start_time:               data.start_time,
    p_end_time:                 data.end_time,
    p_title:                    data.title,
    p_modality_id:              data.modality_id,
    p_level_id:                 data.level_id ?? null,
    p_focus_ids:                data.focus_ids ?? [],
    p_audience_ids:             data.audience_ids ?? [],
    p_area:                     data.area ?? null,
    p_sort_order:               data.sort_order ?? 0,
    p_active:                   data.active ?? true,
    p_link_label:               data.link_label ?? null,
    p_link_url:                 data.link_url ?? null,
    p_show_instructor:          data.show_instructor ?? false,
    p_instructor_name_display:  data.instructor_name_display ?? "full",
  });
  if (error) throw new Error(error.message);
  const resolvedSlotId = slotId as number;
  if (resolvedSlotId == null) {
    throw new Error("create_schedule_slot_tx returned no id");
  }

  if (assignments.length > 0) {
    await syncSlotInstructors(supabase, resolvedSlotId, assignments);
  }

  await logAuditEvent("CREATE", "schedule_slots", resolvedSlotId, {
    ...data,
    instructors: assignments,
  });
  revalidatePath("/");
  revalidatePath("/admin/schedule");
}

export async function updateScheduleEntry(id: number, data: ScheduleSlotPayload): Promise<void> {
  await requireAdmin();

  const supabase = createClient();
  const { data: before } = await supabase.from("schedule_slots").select("*").eq("id", id).single();

  // Instructor side: `undefined` means "don't touch"; `[]` means "clear".
  const shouldSyncInstructors = data.instructors !== undefined;
  const assignments = shouldSyncInstructors
    ? await resolveAssignments(supabase, data.instructors)
    : [];

  const svc = createServiceClient();
  const { error } = await svc.rpc("update_schedule_slot_tx", {
    p_slot_id:                  id,
    p_day_of_week:              data.day_of_week,
    p_start_time:               data.start_time,
    p_end_time:                 data.end_time,
    p_title:                    data.title,
    p_modality_id:              data.modality_id,
    p_level_id:                 data.level_id ?? null,
    p_focus_ids:                data.focus_ids ?? [],
    p_audience_ids:             data.audience_ids ?? [],
    p_area:                     data.area ?? null,
    p_sort_order:               data.sort_order ?? 0,
    p_active:                   data.active ?? true,
    p_link_label:               data.link_label ?? null,
    p_link_url:                 data.link_url ?? null,
    p_show_instructor:          data.show_instructor ?? false,
    p_instructor_name_display:  data.instructor_name_display ?? "full",
  });
  if (error) throw new Error(error.message);

  if (shouldSyncInstructors) {
    await syncSlotInstructors(supabase, id, assignments);
  }

  await logAuditEvent("UPDATE", "schedule_slots", id, {
    before,
    after: data,
    instructors: assignments,
  });
  revalidatePath("/");
  revalidatePath("/admin/schedule");
}

export async function deleteScheduleEntry(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("schedule_slots").select("*").eq("id", id).single();
  // `schedule_slot_instructors` + focus/audience junctions cascade via FK.
  const { error } = await supabase.from("schedule_slots").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "schedule_slots", id, { deleted: before });
  revalidatePath("/");
  revalidatePath("/admin/schedule");
}

export async function toggleScheduleEntry(id: number, active: boolean) {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase.from("schedule_slots").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "schedule_slots", id, { field: "active", from: !active, to: active });
  revalidatePath("/");
  revalidatePath("/admin/schedule");
}
