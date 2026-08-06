"use server";

/**
 * Class-taxonomy CRUD — the four dimensional tables that replace the
 * legacy free-text `discipline`/`level`/`category`/`audience_note` model
 * on `schedule_slots`. Authored per class-taxonomy-LLD §3.1.
 *
 * Every dimension (modality / level / focus / audience) follows the same
 * shape: list · create · update · deactivate · reorder, plus a
 * per-dimension hard delete where the FK semantics allow it.
 *
 * Pre-flight counts are returned from the deactivate/delete helpers so
 * the admin UI can drive the confirmation dialog rules from LLD §4.2
 * without a second round-trip.
 */
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import type {
  ClassModality,
  ClassLevel,
  ClassFocus,
  ClassAudience,
  AudienceKind,
} from "@/lib/supabase/types";

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Kebab-case slug generator matching the LLD §3.1 contract. Admins can
 * override this by passing an explicit `slug` on create/update, in which
 * case we still normalize for safety.
 */
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function revalidateAll() {
  revalidatePath("/admin/classes");
  revalidatePath("/admin/schedule");
  revalidatePath("/");
}

export type DimensionKind = "modality" | "level" | "focus" | "audience";

/** Usage counts returned by a pre-flight before deactivation / delete.
 *  Drives the confirmation-dialog rules in LLD §4.2. */
export interface UsageCounts {
  slotCount: number;
  checkInCount: number;
}

// ── Modalities ──────────────────────────────────────────────────────────

export async function listModalities(opts?: {
  includeInactive?: boolean;
}): Promise<ClassModality[]> {
  const supabase = createClient();
  let query = supabase.from("class_modalities").select("*").order("sort_order");
  if (!opts?.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ClassModality[];
}

export async function createModality(data: {
  name: string;
  slug?: string;
  color?: string | null;
  sort_order?: number;
}): Promise<ClassModality> {
  await requireAdmin();
  const trimmed = data.name.trim();
  if (!trimmed) throw new Error("Modality name is required.");
  const slug = slugify(data.slug ?? trimmed);
  if (!slug) throw new Error("Modality slug must contain alphanumerics.");
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("class_modalities")
    .insert({
      name: trimmed,
      slug,
      color: data.color ?? null,
      sort_order: data.sort_order ?? 0,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "class_modalities", row!.id as number, {
    name: trimmed,
    slug,
    color: data.color ?? null,
  });
  revalidateAll();
  return row as ClassModality;
}

export async function updateModality(
  id: number,
  changes: Partial<Pick<ClassModality, "name" | "slug" | "color" | "active" | "sort_order">>,
): Promise<void> {
  await requireAdmin();
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    const trimmed = changes.name.trim();
    if (!trimmed) throw new Error("Modality name is required.");
    patch.name = trimmed;
  }
  if (changes.slug !== undefined) {
    const slug = slugify(changes.slug);
    if (!slug) throw new Error("Modality slug must contain alphanumerics.");
    patch.slug = slug;
  }
  if (changes.color !== undefined) patch.color = changes.color;
  if (changes.active !== undefined) patch.active = changes.active;
  if (changes.sort_order !== undefined) patch.sort_order = changes.sort_order;
  if (Object.keys(patch).length === 0) return;

  const supabase = createClient();
  const { data: before } = await supabase
    .from("class_modalities")
    .select("*")
    .eq("id", id)
    .single();
  const { error } = await supabase.from("class_modalities").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "class_modalities", id, { before, after: patch });
  revalidateAll();
}

/**
 * Pre-flight count for modality usage. Returns slot usage and
 * historical check-in attribution counts — consumed by the admin UI
 * to pick the confirmation dialog copy before `deactivateModality`
 * fires.
 */
export async function getModalityUsage(id: number): Promise<UsageCounts> {
  await requireAdmin();
  const supabase = createClient();
  const [{ count: slotCount }, { count: checkInCount }] = await Promise.all([
    supabase
      .from("schedule_slots")
      .select("id", { count: "exact", head: true })
      .eq("modality_id", id),
    supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("modality_id", id),
  ]);
  return { slotCount: slotCount ?? 0, checkInCount: checkInCount ?? 0 };
}

export async function deactivateModality(id: number): Promise<UsageCounts> {
  await requireAdmin();
  const usage = await getModalityUsage(id);
  const supabase = createClient();
  const { error } = await supabase
    .from("class_modalities")
    .update({ active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "class_modalities", id, {
    field: "active",
    from: true,
    to: false,
    ...usage,
  });
  revalidateAll();
  return usage;
}

export async function reactivateModality(id: number): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("class_modalities")
    .update({ active: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "class_modalities", id, {
    field: "active",
    from: false,
    to: true,
  });
  revalidateAll();
}

/**
 * Swap sort_order with the neighbor in the given direction. Mirrors
 * `reorderTeamMember` / `reorderUpdate` — adjacency by numeric sort_order,
 * so a gap or tie is tolerated without blowing up.
 */
export async function reorderModality(
  id: number,
  direction: "up" | "down",
  currentOrder: number,
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase
    .from("class_modalities")
    .select("id")
    .eq("sort_order", targetOrder)
    .maybeSingle();
  if (sibling) {
    await supabase
      .from("class_modalities")
      .update({ sort_order: currentOrder })
      .eq("id", sibling.id);
  }
  await supabase
    .from("class_modalities")
    .update({ sort_order: targetOrder })
    .eq("id", id);
  revalidatePath("/admin/classes");
  revalidatePath("/");
}

// NOTE: deleteModality intentionally omitted — the `schedule_slots.modality_id`
// FK is ON DELETE RESTRICT. The admin UI routes to `deactivateModality`
// when in use, matching LLD §3.1.

// ── Levels ──────────────────────────────────────────────────────────────

export async function listLevels(opts?: {
  includeInactive?: boolean;
}): Promise<ClassLevel[]> {
  const supabase = createClient();
  let query = supabase.from("class_levels").select("*").order("sort_order");
  if (!opts?.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ClassLevel[];
}

export async function createLevel(data: {
  name: string;
  slug?: string;
  sort_order?: number;
}): Promise<ClassLevel> {
  await requireAdmin();
  const trimmed = data.name.trim();
  if (!trimmed) throw new Error("Level name is required.");
  const slug = slugify(data.slug ?? trimmed);
  if (!slug) throw new Error("Level slug must contain alphanumerics.");
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("class_levels")
    .insert({ name: trimmed, slug, sort_order: data.sort_order ?? 0, active: true })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "class_levels", row!.id as number, { name: trimmed, slug });
  revalidateAll();
  return row as ClassLevel;
}

export async function updateLevel(
  id: number,
  changes: Partial<Pick<ClassLevel, "name" | "slug" | "active" | "sort_order">>,
): Promise<void> {
  await requireAdmin();
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    const trimmed = changes.name.trim();
    if (!trimmed) throw new Error("Level name is required.");
    patch.name = trimmed;
  }
  if (changes.slug !== undefined) {
    const slug = slugify(changes.slug);
    if (!slug) throw new Error("Level slug must contain alphanumerics.");
    patch.slug = slug;
  }
  if (changes.active !== undefined) patch.active = changes.active;
  if (changes.sort_order !== undefined) patch.sort_order = changes.sort_order;
  if (Object.keys(patch).length === 0) return;

  const supabase = createClient();
  const { data: before } = await supabase
    .from("class_levels")
    .select("*")
    .eq("id", id)
    .single();
  const { error } = await supabase.from("class_levels").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "class_levels", id, { before, after: patch });
  revalidateAll();
}

export async function getLevelUsage(id: number): Promise<UsageCounts> {
  await requireAdmin();
  const supabase = createClient();
  const [{ count: slotCount }, { count: checkInCount }] = await Promise.all([
    supabase
      .from("schedule_slots")
      .select("id", { count: "exact", head: true })
      .eq("level_id", id),
    supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("level_id", id),
  ]);
  return { slotCount: slotCount ?? 0, checkInCount: checkInCount ?? 0 };
}

export async function deactivateLevel(id: number): Promise<UsageCounts> {
  await requireAdmin();
  const usage = await getLevelUsage(id);
  const supabase = createClient();
  const { error } = await supabase
    .from("class_levels")
    .update({ active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "class_levels", id, {
    field: "active",
    from: true,
    to: false,
    ...usage,
  });
  revalidateAll();
  return usage;
}

export async function reactivateLevel(id: number): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("class_levels")
    .update({ active: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "class_levels", id, { field: "active", from: false, to: true });
  revalidateAll();
}

export async function reorderLevel(
  id: number,
  direction: "up" | "down",
  currentOrder: number,
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase
    .from("class_levels")
    .select("id")
    .eq("sort_order", targetOrder)
    .maybeSingle();
  if (sibling) {
    await supabase
      .from("class_levels")
      .update({ sort_order: currentOrder })
      .eq("id", sibling.id);
  }
  await supabase
    .from("class_levels")
    .update({ sort_order: targetOrder })
    .eq("id", id);
  revalidatePath("/admin/classes");
  revalidatePath("/");
}

/**
 * Hard delete for a level. FK is ON DELETE SET NULL on `schedule_slots`
 * and `check_ins`, so the DB accepts the delete — but we still refuse
 * when slots currently reference the row. Check-ins are tolerated
 * because the snapshot `level_name` preserves the historical label.
 */
export async function deleteLevel(id: number): Promise<void> {
  await requireAdmin();
  const usage = await getLevelUsage(id);
  if (usage.slotCount > 0) {
    throw new Error(
      `Cannot delete level: ${usage.slotCount} active slot(s) still reference it. Deactivate instead.`,
    );
  }
  const supabase = createClient();
  const { data: before } = await supabase
    .from("class_levels")
    .select("*")
    .eq("id", id)
    .single();
  const { error } = await supabase.from("class_levels").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "class_levels", id, { deleted: before, ...usage });
  revalidateAll();
}

// ── Focuses ─────────────────────────────────────────────────────────────

export async function listFocuses(opts?: {
  includeInactive?: boolean;
}): Promise<ClassFocus[]> {
  const supabase = createClient();
  let query = supabase.from("class_focuses").select("*").order("sort_order");
  if (!opts?.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ClassFocus[];
}

export async function createFocus(data: {
  name: string;
  slug?: string;
  sort_order?: number;
}): Promise<ClassFocus> {
  await requireAdmin();
  const trimmed = data.name.trim();
  if (!trimmed) throw new Error("Focus name is required.");
  const slug = slugify(data.slug ?? trimmed);
  if (!slug) throw new Error("Focus slug must contain alphanumerics.");
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("class_focuses")
    .insert({ name: trimmed, slug, sort_order: data.sort_order ?? 0, active: true })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "class_focuses", row!.id as number, { name: trimmed, slug });
  revalidateAll();
  return row as ClassFocus;
}

export async function updateFocus(
  id: number,
  changes: Partial<Pick<ClassFocus, "name" | "slug" | "active" | "sort_order">>,
): Promise<void> {
  await requireAdmin();
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    const trimmed = changes.name.trim();
    if (!trimmed) throw new Error("Focus name is required.");
    patch.name = trimmed;
  }
  if (changes.slug !== undefined) {
    const slug = slugify(changes.slug);
    if (!slug) throw new Error("Focus slug must contain alphanumerics.");
    patch.slug = slug;
  }
  if (changes.active !== undefined) patch.active = changes.active;
  if (changes.sort_order !== undefined) patch.sort_order = changes.sort_order;
  if (Object.keys(patch).length === 0) return;

  const supabase = createClient();
  const { data: before } = await supabase
    .from("class_focuses")
    .select("*")
    .eq("id", id)
    .single();
  const { error } = await supabase.from("class_focuses").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "class_focuses", id, { before, after: patch });
  revalidateAll();
}

/**
 * Focus usage is tracked via its two junctions (`schedule_slot_focuses`
 * and `check_in_focuses`) — there is no scalar `focus_id` on either
 * parent table.
 */
export async function getFocusUsage(id: number): Promise<UsageCounts> {
  await requireAdmin();
  const supabase = createClient();
  const [{ count: slotCount }, { count: checkInCount }] = await Promise.all([
    supabase
      .from("schedule_slot_focuses")
      .select("schedule_slot_id", { count: "exact", head: true })
      .eq("focus_id", id),
    supabase
      .from("check_in_focuses")
      .select("check_in_id", { count: "exact", head: true })
      .eq("focus_id", id),
  ]);
  return { slotCount: slotCount ?? 0, checkInCount: checkInCount ?? 0 };
}

export async function deactivateFocus(id: number): Promise<UsageCounts> {
  await requireAdmin();
  const usage = await getFocusUsage(id);
  const supabase = createClient();
  const { error } = await supabase
    .from("class_focuses")
    .update({ active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "class_focuses", id, {
    field: "active",
    from: true,
    to: false,
    ...usage,
  });
  revalidateAll();
  return usage;
}

export async function reactivateFocus(id: number): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("class_focuses")
    .update({ active: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "class_focuses", id, { field: "active", from: false, to: true });
  revalidateAll();
}

export async function reorderFocus(
  id: number,
  direction: "up" | "down",
  currentOrder: number,
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase
    .from("class_focuses")
    .select("id")
    .eq("sort_order", targetOrder)
    .maybeSingle();
  if (sibling) {
    await supabase
      .from("class_focuses")
      .update({ sort_order: currentOrder })
      .eq("id", sibling.id);
  }
  await supabase
    .from("class_focuses")
    .update({ sort_order: targetOrder })
    .eq("id", id);
  revalidatePath("/admin/classes");
  revalidatePath("/");
}

export async function deleteFocus(id: number): Promise<void> {
  await requireAdmin();
  const usage = await getFocusUsage(id);
  if (usage.slotCount > 0) {
    throw new Error(
      `Cannot delete focus: ${usage.slotCount} active slot reference(s) still exist. Deactivate instead.`,
    );
  }
  const supabase = createClient();
  const { data: before } = await supabase
    .from("class_focuses")
    .select("*")
    .eq("id", id)
    .single();
  const { error } = await supabase.from("class_focuses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "class_focuses", id, { deleted: before, ...usage });
  revalidateAll();
}

// ── Audiences ───────────────────────────────────────────────────────────

/**
 * TS-side validation mirroring the DB CHECK constraints defined in
 * migration 20240167. Throwing early surfaces a clean error instead of
 * a raw Postgres constraint violation.
 */
function validateAudienceShape(data: {
  kind: AudienceKind;
  min_age?: number | null;
  max_age?: number | null;
  gender?: "female" | "male" | null;
}): void {
  const { kind, min_age, max_age, gender } = data;
  if (kind === "age") {
    const hasMin = min_age !== undefined && min_age !== null;
    const hasMax = max_age !== undefined && max_age !== null;
    if (!hasMin && !hasMax) {
      throw new Error("Age audience requires at least one of min_age or max_age.");
    }
    if (gender) {
      throw new Error("Age audience cannot carry a gender value.");
    }
    if (hasMin && hasMax && (min_age as number) > (max_age as number)) {
      throw new Error("min_age cannot exceed max_age.");
    }
  } else if (kind === "gender") {
    if (!gender) throw new Error("Gender audience requires a gender value.");
    if (gender !== "female" && gender !== "male") {
      throw new Error("Gender audience must be 'female' or 'male'.");
    }
    if ((min_age !== undefined && min_age !== null) || (max_age !== undefined && max_age !== null)) {
      throw new Error("Gender audience cannot carry age bounds.");
    }
  } else {
    // rank / access — no enforcement metadata of any kind.
    if (
      (min_age !== undefined && min_age !== null) ||
      (max_age !== undefined && max_age !== null) ||
      gender
    ) {
      throw new Error(`Audience kind '${kind}' does not accept enforcement metadata.`);
    }
  }
}

export async function listAudiences(opts?: {
  includeInactive?: boolean;
  kind?: AudienceKind;
}): Promise<ClassAudience[]> {
  const supabase = createClient();
  let query = supabase
    .from("class_audiences")
    .select("*")
    .order("kind")
    .order("sort_order");
  if (!opts?.includeInactive) query = query.eq("active", true);
  if (opts?.kind) query = query.eq("kind", opts.kind);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ClassAudience[];
}

export async function createAudience(data: {
  name: string;
  slug?: string;
  kind: AudienceKind;
  min_age?: number | null;
  max_age?: number | null;
  gender?: "female" | "male" | null;
  sort_order?: number;
}): Promise<ClassAudience> {
  await requireAdmin();
  const trimmed = data.name.trim();
  if (!trimmed) throw new Error("Audience name is required.");
  validateAudienceShape(data);
  const slug = slugify(data.slug ?? trimmed);
  if (!slug) throw new Error("Audience slug must contain alphanumerics.");
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("class_audiences")
    .insert({
      name: trimmed,
      slug,
      kind: data.kind,
      min_age: data.kind === "age" ? data.min_age ?? null : null,
      max_age: data.kind === "age" ? data.max_age ?? null : null,
      gender: data.kind === "gender" ? data.gender ?? null : null,
      sort_order: data.sort_order ?? 0,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "class_audiences", row!.id as number, {
    name: trimmed,
    slug,
    kind: data.kind,
  });
  revalidateAll();
  return row as ClassAudience;
}

export async function updateAudience(
  id: number,
  changes: Partial<Pick<ClassAudience, "name" | "slug" | "active" | "sort_order" | "min_age" | "max_age" | "gender">> & {
    kind?: AudienceKind;
  },
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { data: before, error: beforeErr } = await supabase
    .from("class_audiences")
    .select("*")
    .eq("id", id)
    .single();
  if (beforeErr) throw new Error(beforeErr.message);

  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    const trimmed = changes.name.trim();
    if (!trimmed) throw new Error("Audience name is required.");
    patch.name = trimmed;
  }
  if (changes.slug !== undefined) {
    const slug = slugify(changes.slug);
    if (!slug) throw new Error("Audience slug must contain alphanumerics.");
    patch.slug = slug;
  }
  if (changes.active !== undefined) patch.active = changes.active;
  if (changes.sort_order !== undefined) patch.sort_order = changes.sort_order;

  // Changing `kind` requires revalidating the metadata shape against
  // the NEW kind — and nulling out fields that don't belong.
  const effectiveKind: AudienceKind = changes.kind ?? (before as ClassAudience).kind;
  if (changes.kind !== undefined) patch.kind = changes.kind;

  if (changes.min_age !== undefined) patch.min_age = changes.min_age;
  if (changes.max_age !== undefined) patch.max_age = changes.max_age;
  if (changes.gender !== undefined) patch.gender = changes.gender;

  validateAudienceShape({
    kind: effectiveKind,
    min_age: patch.min_age !== undefined ? (patch.min_age as number | null) : (before as ClassAudience).min_age,
    max_age: patch.max_age !== undefined ? (patch.max_age as number | null) : (before as ClassAudience).max_age,
    gender: patch.gender !== undefined
      ? (patch.gender as "female" | "male" | null)
      : (before as ClassAudience).gender,
  });

  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("class_audiences").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "class_audiences", id, { before, after: patch });
  revalidateAll();
}

export async function getAudienceUsage(id: number): Promise<UsageCounts> {
  await requireAdmin();
  const supabase = createClient();
  const [{ count: slotCount }, { count: checkInCount }] = await Promise.all([
    supabase
      .from("schedule_slot_audiences")
      .select("schedule_slot_id", { count: "exact", head: true })
      .eq("audience_id", id),
    supabase
      .from("check_in_audiences")
      .select("check_in_id", { count: "exact", head: true })
      .eq("audience_id", id),
  ]);
  return { slotCount: slotCount ?? 0, checkInCount: checkInCount ?? 0 };
}

export async function deactivateAudience(id: number): Promise<UsageCounts> {
  await requireAdmin();
  const usage = await getAudienceUsage(id);
  const supabase = createClient();
  const { error } = await supabase
    .from("class_audiences")
    .update({ active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "class_audiences", id, {
    field: "active",
    from: true,
    to: false,
    ...usage,
  });
  revalidateAll();
  return usage;
}

export async function reactivateAudience(id: number): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("class_audiences")
    .update({ active: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("TOGGLE", "class_audiences", id, { field: "active", from: false, to: true });
  revalidateAll();
}

export async function reorderAudience(
  id: number,
  direction: "up" | "down",
  currentOrder: number,
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const targetOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;
  const { data: sibling } = await supabase
    .from("class_audiences")
    .select("id")
    .eq("sort_order", targetOrder)
    .maybeSingle();
  if (sibling) {
    await supabase
      .from("class_audiences")
      .update({ sort_order: currentOrder })
      .eq("id", sibling.id);
  }
  await supabase
    .from("class_audiences")
    .update({ sort_order: targetOrder })
    .eq("id", id);
  revalidatePath("/admin/classes");
  revalidatePath("/");
}

export async function deleteAudience(id: number): Promise<void> {
  await requireAdmin();
  const usage = await getAudienceUsage(id);
  if (usage.slotCount > 0) {
    throw new Error(
      `Cannot delete audience: ${usage.slotCount} active slot reference(s) still exist. Deactivate instead.`,
    );
  }
  const supabase = createClient();
  const { data: before } = await supabase
    .from("class_audiences")
    .select("*")
    .eq("id", id)
    .single();
  const { error } = await supabase.from("class_audiences").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "class_audiences", id, { deleted: before, ...usage });
  revalidateAll();
}

// ── Needs-review (modality tab bottom list) ─────────────────────────────

