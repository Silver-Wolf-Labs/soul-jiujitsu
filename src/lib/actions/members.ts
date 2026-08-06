"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, requireOwner } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";
import type { MemberStatus } from "@/lib/supabase/types";

export async function createMember(data: {
  first_name: string; last_name: string; email: string; phone?: string;
  status: MemberStatus; emergency_contact_name?: string; emergency_contact_phone?: string;
  notes?: string; communication_opt_in: boolean;
}) {
  await requireAdmin();
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("members").insert({ ...data, email: data.email.toLowerCase().trim() })
    .select("id").single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "members", String(row.id), { ...data });
}

export async function updateMember(id: number, data: Partial<{
  first_name: string; last_name: string; email: string; phone: string;
  status: MemberStatus; emergency_contact_name: string; emergency_contact_phone: string;
  emergency_contact_relationship: string;
  notes: string; communication_opt_in: boolean;
  // Demographics
  birth_month: number; birth_year: number;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  // Training
  training_started_at: string;
}>) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("members").select("*").eq("id", id).single();
  const { error } = await supabase.from("members").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "members", String(id), { before, after: data });
}

export async function deleteMember(id: number) {
  await requireOwner();  // destructive — owner-only
  const supabase = createClient();
  const { data: before } = await supabase.from("members").select("*").eq("id", id).single();
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "members", String(id), { deleted: before });
}

export async function deleteMemberWithOptions(
  id: number,
  options: { preserveWaivers: boolean }
) {
  await requireOwner();  // destructive — owner-only
  const supabase = createClient();

  // Get full member data for audit
  const { data: member } = await supabase.from("members").select("*").eq("id", id).single();
  if (!member) throw new Error("Member not found");

  // Capture the acting admin for archived_by metadata.
  const { data: { user } } = await supabase.auth.getUser();

  // Archive + delete run atomically inside a single Postgres function so
  // retries cannot produce duplicate archive rows or orphaned archives.
  const service = createServiceClient();
  const { error: rpcError } = await service.rpc("delete_member_tx", {
    p_member_id: id,
    p_preserve_waivers: options.preserveWaivers,
    p_archived_by: user?.email ?? null,
  });
  if (rpcError) throw new Error(rpcError.message);

  await logAuditEvent("DELETE", "members", String(id), {
    deleted: member,
    waiversPreserved: options.preserveWaivers,
  });
}

export async function updateMemberStatus(id: number, status: MemberStatus) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("members").select("status").eq("id", id).single();
  const { error } = await supabase.from("members").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "members", String(id), { before: { status: before?.status }, after: { status } });
}
