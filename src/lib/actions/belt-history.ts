"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";
import { type BeltEventType, labelForEvent } from "@/lib/belt-events";

const BELT_ORDER = ["white", "blue", "purple", "brown", "black"] as const;
type Belt = typeof BELT_ORDER[number];

function nextBelt(current: Belt): Belt | null {
  const idx = BELT_ORDER.indexOf(current);
  return idx < BELT_ORDER.length - 1 ? BELT_ORDER[idx + 1] : null;
}

/**
 * Resolve the admin's display name (profiles.full_name) for attribution in
 * belt_history and the audit log. Falls back to email when the name isn't
 * set, and finally to "Admin" so the UI always has something to render.
 *
 * Returns { email, name } so callers can pass both into the RPCs and the
 * audit payload without duplicating the lookup.
 */
async function adminIdentity(): Promise<{ email: string | null; name: string }> {
  const user = await requireAdmin();
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const email = user.email ?? null;
  const name =
    (profile?.full_name && profile.full_name.trim()) ||
    email ||
    "Admin";
  return { email, name };
}

/**
 * Promote a member to the next belt.
 * Resets stripes to 0, records in belt_history with event_type='promotion',
 * and sets belt_awarded_at (or NULL when promoted to white, though that
 * shouldn't happen in the happy path).
 */
export async function promoteMember(
  memberId: number,
  opts?: { notes?: string; targetBelt?: Belt }
) {
  const admin = await adminIdentity();
  const supabase = createClient();

  const { data: member } = await supabase
    .from("members")
    .select("belt, stripes")
    .eq("id", memberId)
    .single();
  if (!member) throw new Error("Member not found");

  const currentBelt = (member.belt || "white") as Belt;
  const newBelt = opts?.targetBelt ?? nextBelt(currentBelt);
  if (!newBelt) throw new Error("Already at highest belt (black)");

  const service = createServiceClient();
  const { error: rpcError } = await service.rpc("promote_member_tx", {
    p_member_id: memberId,
    p_new_belt: newBelt,
    p_admin_email: admin.email,
    p_admin_name: admin.name,
    p_note: opts?.notes || `Promoted from ${currentBelt} to ${newBelt}`,
  });
  if (rpcError) throw new Error(rpcError.message);

  await logAuditEvent("UPDATE", "members", String(memberId), {
    action: "belt_promotion",
    from: { belt: currentBelt, stripes: member.stripes },
    to: { belt: newBelt, stripes: 0 },
    admin_name: admin.name,
    admin_email: admin.email,
  });
}

/**
 * Add a stripe to a member (max 4). Records event_type='stripe'.
 */
export async function addStripe(
  memberId: number,
  opts?: { notes?: string }
) {
  const admin = await adminIdentity();
  const supabase = createClient();

  const { data: member } = await supabase
    .from("members")
    .select("belt, stripes")
    .eq("id", memberId)
    .single();
  if (!member) throw new Error("Member not found");

  const currentStripes = member.stripes ?? 0;
  const currentBelt = (member.belt || "white") as Belt;
  // BJJ black belts carry up to 6 stripes (degrees); colored belts cap at 4.
  const maxStripes = currentBelt === "black" ? 6 : 4;
  if (currentStripes >= maxStripes) {
    throw new Error(`Already at maximum stripes (${maxStripes}) for ${currentBelt} belt`);
  }

  const newStripes = currentStripes + 1;

  const service = createServiceClient();
  const { error: rpcError } = await service.rpc("add_stripe_tx", {
    p_member_id: memberId,
    p_admin_email: admin.email,
    p_admin_name: admin.name,
    p_note: opts?.notes || `Stripe ${newStripes} added`,
  });
  if (rpcError) throw new Error(rpcError.message);

  await logAuditEvent("UPDATE", "members", String(memberId), {
    action: "stripe_added",
    belt: member.belt,
    from: currentStripes,
    to: newStripes,
    admin_name: admin.name,
    admin_email: admin.email,
  });
}

/**
 * Admin-facing "full belt detail edit".
 *
 * Accepts the desired belt, stripes, optional dates, AND the event type so
 * the timeline entry is tagged correctly — the same form can be used to
 * record a promotion the admin forgot to flag on the day, a stripe award,
 * or a data correction. The RPC nulls `belt_awarded_at` when the belt is
 * white, so white-belt members never carry a stale awarded date.
 */
export async function updateMemberBeltDetails(
  memberId: number,
  data: {
    belt: Belt;
    stripes: number;
    /** ISO date "YYYY-MM-DD" or null to leave unchanged. */
    belt_awarded_at: string | null;
    /** ISO date "YYYY-MM-DD" or null to leave unchanged. */
    training_started_at: string | null;
    event_type: BeltEventType;
    notes?: string;
  },
) {
  const admin = await adminIdentity();

  if (!BELT_ORDER.includes(data.belt)) {
    throw new Error(`Invalid belt: ${data.belt}`);
  }
  // Black belt allows 0-6 stripes (degrees); colored belts 0-4.
  const maxStripes = data.belt === "black" ? 6 : 4;
  if (
    !Number.isInteger(data.stripes)
    || data.stripes < 0
    || data.stripes > maxStripes
  ) {
    throw new Error(`Stripes must be an integer between 0 and ${maxStripes} for ${data.belt} belt`);
  }
  const validEvents: BeltEventType[] = ["promotion", "stripe", "correction"];
  if (!validEvents.includes(data.event_type)) {
    throw new Error(`Invalid event type: ${data.event_type}`);
  }

  const supabase = createClient();
  const { data: member } = await supabase
    .from("members")
    .select("belt, stripes, belt_awarded_at, training_started_at")
    .eq("id", memberId)
    .single();
  if (!member) throw new Error("Member not found");

  const service = createServiceClient();
  const { error: rpcError } = await service.rpc("update_member_belt_details_tx", {
    p_member_id: memberId,
    p_new_belt: data.belt,
    p_new_stripes: data.stripes,
    // ISO date strings are cast to TIMESTAMPTZ by Postgres; `null` lands as
    // a true SQL NULL and COALESCE in the RPC preserves the existing value.
    // When belt='white' the RPC ignores this and nulls the column.
    p_belt_awarded_at: data.belt_awarded_at,
    p_training_started_at: data.training_started_at,
    p_event_type: data.event_type,
    p_admin_email: admin.email,
    p_admin_name: admin.name,
    p_note:
      data.notes ||
      `${labelForEvent(data.event_type)}: ${data.belt} belt, ${data.stripes} ${data.stripes === 1 ? "stripe" : "stripes"}`,
  });
  if (rpcError) throw new Error(rpcError.message);

  await logAuditEvent("UPDATE", "members", String(memberId), {
    action: data.event_type === "promotion"
      ? "belt_promotion_manual"
      : data.event_type === "stripe"
      ? "stripe_award_manual"
      : "belt_correction",
    event_type: data.event_type,
    from: {
      belt: member.belt,
      stripes: member.stripes,
      belt_awarded_at: member.belt_awarded_at,
      training_started_at: member.training_started_at,
    },
    to: {
      belt: data.belt,
      stripes: data.stripes,
      belt_awarded_at: data.belt === "white" ? null : data.belt_awarded_at,
      training_started_at: data.training_started_at,
    },
    admin_name: admin.name,
    admin_email: admin.email,
    notes: data.notes,
  });
}

/**
 * Fetch belt history for a member.
 *
 * Uses the service client (RLS bypass) behind an explicit requireAdmin()
 * gate. The user-scoped client was occasionally not returning freshly
 * inserted rows after the full-edit RPC landed them — most likely a
 * read-replica / PostgREST-view caching quirk on rows written via
 * SECURITY DEFINER. Going through the service client makes the read
 * deterministic; admin authorization is still enforced in app code.
 */
export async function getBeltHistory(memberId: number) {
  await requireAdmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from("belt_history")
    .select("*")
    .eq("member_id", memberId)
    // Primary sort by the audit timestamp. Secondary sort by id DESC
    // keeps same-timestamp rows stable in insertion order — important
    // for legacy rows that share a promoted_at (pre-20240158) so they
    // don't shuffle between refetches.
    .order("promoted_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
