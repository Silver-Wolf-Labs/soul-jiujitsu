"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { teamMemberSchema, type TeamMemberInput } from "@/lib/validations/team";
import { logAuditEvent } from "@/lib/audit";

type TeamMemberPayload = {
  name: string;
  role: string;
  belt: string;
  bio: string;
  photo_url: string;
  slug: string;
  order: number;
  type: string;
  active: boolean;
  visible_on_public_team?: boolean;
  visible_until?: string | null;
};

/**
 * Keep the `instructors` table in sync with the team row.
 *
 * Every team member is a potential instructor (owner / head coach /
 * instructor / guest can all teach classes in a gym). To keep the
 * admin experience simple, saving a team row auto-creates / updates
 * the corresponding `instructors` row and links them via
 * `team_member_id`.
 *
 * Uses the service client so the upsert survives RLS edge cases —
 * `requireAdmin()` on the caller has already gated the path.
 */
async function syncInstructorLink(teamId: number, parsed: TeamMemberInput): Promise<void> {
  const svc = createServiceClient();
  // 1. An instructor already linked to this team member → refresh name + active.
  const { data: linked } = await svc
    .from("instructors")
    .select("id")
    .eq("team_member_id", teamId)
    .maybeSingle();
  if (linked?.id) {
    await svc
      .from("instructors")
      .update({ name: parsed.name, slug: parsed.slug, active: parsed.active })
      .eq("id", linked.id);
    return;
  }
  // 2. An unlinked instructor with this slug → link it (preserves
  //    existing `instructors.id` so check-in attribution is safe).
  const { data: bySlug } = await svc
    .from("instructors")
    .select("id, team_member_id")
    .eq("slug", parsed.slug)
    .maybeSingle();
  if (bySlug?.id && !bySlug.team_member_id) {
    await svc
      .from("instructors")
      .update({ team_member_id: teamId, name: parsed.name, active: parsed.active })
      .eq("id", bySlug.id);
    return;
  }
  // 3. Otherwise, create a fresh instructors row linked to this team member.
  if (!bySlug) {
    await svc.from("instructors").insert({
      name: parsed.name,
      slug: parsed.slug,
      active: parsed.active,
      team_member_id: teamId,
    });
  }
  // 4. If bySlug exists but is already linked to a DIFFERENT team member,
  //    leave it alone — admin collision they need to resolve manually.
}

export async function createTeamMember(data: TeamMemberPayload) {
  await requireAdmin();
  const parsed = teamMemberSchema.parse(data);
  const supabase = createClient();
  const { error, data: row } = await supabase.from("team").insert(parsed).select("id").single();
  if (error) throw new Error(error.message);
  const teamId = row?.id as number;
  await syncInstructorLink(teamId, parsed);
  await logAuditEvent("CREATE", "team", teamId, { ...parsed });
  revalidatePath("/");
  revalidatePath("/admin/team");
  revalidatePath("/admin/schedule");
}

export async function updateTeamMember(id: number, data: TeamMemberPayload) {
  await requireAdmin();
  const parsed = teamMemberSchema.parse(data);
  const supabase = createClient();
  const { data: before } = await supabase.from("team").select("*").eq("id", id).single();
  const { error } = await supabase.from("team").update(parsed).eq("id", id);
  if (error) throw new Error(error.message);
  await syncInstructorLink(id, parsed);
  await logAuditEvent("UPDATE", "team", id, { before, after: parsed });
  revalidatePath("/");
  revalidatePath("/admin/team");
  revalidatePath("/admin/schedule");
}

export async function toggleTeamActive(id: number, active: boolean) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("team").update({ active }).eq("id", id);
  // Mirror the activation state onto any linked instructor so the
  // combobox dropdown immediately stops offering inactive coaches.
  const svc = createServiceClient();
  await svc.from("instructors").update({ active }).eq("team_member_id", id);
  await logAuditEvent("TOGGLE", "team", id, { field: "active", from: !active, to: active });
  revalidatePath("/");
  revalidatePath("/admin/team");
  revalidatePath("/admin/schedule");
}

export async function deleteTeamMember(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("team").select("*").eq("id", id).single();
  // The `instructors.team_member_id` FK is ON DELETE SET NULL, so
  // deleting the team row demotes the instructor to a stub instead
  // of nuking them. Historical check-in attribution is preserved via
  // `instructor_id` + snapshot name on each check-in.
  const { error } = await supabase.from("team").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "team", id, { deleted: before });
  revalidatePath("/");
  revalidatePath("/admin/team");
  revalidatePath("/admin/schedule");
}

export async function reorderTeamMember(id: number, direction: "up" | "down", currentOrder: number) {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase.from("team").select("id").eq("order", targetOrder).maybeSingle();
  if (sibling) {
    await supabase.from("team").update({ order: currentOrder }).eq("id", sibling.id);
  }
  await supabase.from("team").update({ order: targetOrder }).eq("id", id);
  revalidatePath("/");
}
