"use server";

/**
 * Instructor CRUD + queries — the source of truth for the
 * `InstructorCombobox` used in the schedule modal and for `/admin/team`
 * management.
 *
 * Keep this module focused: list + create + update + activate. Deletions
 * are handled via the team admin surface so cascading concerns
 * (check-in attribution, junction rows) are co-located.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { revalidatePath } from "next/cache";

export interface InstructorOption {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  /** Linked team member id. null → this is a stub (no public profile). */
  team_member_id: number | null;
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Full list of instructors — includes inactive so the admin UI can show
 * a dedicated "archived" section. Dropdown callers filter to active in
 * the component.
 */
export async function listInstructors(): Promise<InstructorOption[]> {
  await requireAdmin();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("instructors")
    .select("id, name, slug, active, team_member_id")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as InstructorOption[];
}

/**
 * Create or reuse an instructor identity. When `name` matches an existing
 * slug (case-insensitive), the existing row is returned — that's the
 * inline-stub create pattern from the schedule modal.
 *
 * Names of any length ≥ 1 are accepted: "J", "JC", "Fau", "Ana Maria Silva".
 * The slug normalizes whitespace + punctuation, so "JC" and "jc" land on
 * the same instructor.
 */
export async function createOrGetStubInstructor(
  name: string,
): Promise<InstructorOption> {
  await requireAdmin();
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("Instructor name is required.");

  // Use the service client so a failed RLS check on one path doesn't
  // block an otherwise-legitimate stub creation — we've already gated
  // on requireAdmin().
  const svc = createServiceClient();
  const slug = slugify(trimmed);
  if (slug.length === 0) throw new Error("Instructor name must contain at least one alphanumeric character.");

  const { data: existing } = await svc
    .from("instructors")
    .select("id, name, slug, active, team_member_id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return existing as InstructorOption;

  const { data: created, error } = await svc
    .from("instructors")
    .insert({ name: trimmed, slug, active: true })
    .select("id, name, slug, active, team_member_id")
    .single();
  if (error) throw new Error(`Could not create instructor: ${error.message}`);
  revalidatePath("/admin/team");
  revalidatePath("/admin/schedule");
  return created as InstructorOption;
}

/** Update an instructor's name/active state. Slug is auto-maintained
 *  when the name changes (keeps analytics joins stable via `id`). */
export async function updateInstructor(
  id: number,
  changes: { name?: string; active?: boolean },
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    const trimmed = changes.name.trim();
    if (trimmed.length === 0) throw new Error("Instructor name is required.");
    patch.name = trimmed;
    patch.slug = slugify(trimmed);
  }
  if (changes.active !== undefined) patch.active = changes.active;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("instructors").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
  revalidatePath("/admin/schedule");
}
