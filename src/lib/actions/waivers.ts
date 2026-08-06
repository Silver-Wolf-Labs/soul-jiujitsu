"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, requireOwner } from "@/lib/supabase/require-admin";
import { getGymProfile } from "@/lib/gym-profile";
import { substituteWaiverPlaceholders } from "@/lib/waiver-substitute";
import { logAuditEvent } from "@/lib/audit";

/**
 * Owner-only — waiver templates are the legal document every member
 * signs. A compromised manager mustn't be able to alter them.
 */
export async function createWaiverTemplate(data: { title: string; body_md: string }) {
  await requireOwner();
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("waiver_templates")
    .insert({ title: data.title, body_md: data.body_md, version: 1, active: false })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "waiver_templates", String(row.id), { title: data.title, version: 1 });
  return { id: row.id };
}

export async function updateWaiverTemplate(id: number, data: { title: string; body_md: string }) {
  await requireOwner();
  const supabase = createClient();

  // Check if any signatures exist for this template
  const { count } = await supabase
    .from("waiver_signatures")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);

  if (count && count > 0) {
    // Create a new version instead of mutating
    const { data: existing, error: fetchError } = await supabase
      .from("waiver_templates")
      .select("version")
      .eq("id", id)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    const newVersion = (existing?.version ?? 1) + 1;
    const { data: row, error } = await supabase
      .from("waiver_templates")
      .insert({ title: data.title, body_md: data.body_md, version: newVersion, active: false })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAuditEvent("CREATE", "waiver_templates", String(row.id), {
      reason: "new_version_from_signed_template",
      source_id: id,
      version: newVersion,
      title: data.title,
    });
    return { id: row.id, newVersion: true };
  }

  // No signatures — update in place
  const { data: before } = await supabase
    .from("waiver_templates")
    .select("*")
    .eq("id", id)
    .single();
  const { error } = await supabase
    .from("waiver_templates")
    .update({ title: data.title, body_md: data.body_md })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "waiver_templates", String(id), {
    before,
    after: { title: data.title, body_md: data.body_md },
  });
  return { id, newVersion: false };
}

export async function activateWaiverTemplate(id: number) {
  await requireOwner();  // activating a template changes what new members sign

  // Deactivate-all + activate-target must be atomic: if it happens in two
  // separate UPDATEs and the second one fails, we end up with zero active
  // templates and every signup breaks. Delegate to a Postgres function
  // that does both in a single statement inside one transaction.
  //
  // Called via the service client to keep the pattern consistent with
  // the other transactional RPCs in this file (requireAdmin() above is
  // still the authorization gate).
  const service = createServiceClient();
  const { error } = await service.rpc("activate_waiver_template_tx", {
    p_template_id: id,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent("TOGGLE", "waiver_templates", String(id), { action: "activated" });
}

// ── Signature payload ──────────────────────────────────────────────────────────

type SignaturePayload =
  | { type: "typed"; initials: string }
  | { type: "drawn"; dataUrl: string };

/**
 * Records a waiver signature for the authenticated member.
 *
 * For drawn signatures: decodes the PNG data URL, uploads it to Supabase
 * Storage (bucket: "signatures"), and stores the storage path in the DB.
 * For typed signatures: stores the initials text directly.
 */
export async function signWaiver(
  templateId: number,
  signature?: SignaturePayload
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get the member row for this user
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (memberError || !member) return { error: "No member record found" };

  // Fetch the template
  const { data: template, error: templateError } = await supabase
    .from("waiver_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (templateError || !template) return { error: "Waiver template not found" };

  // Idempotency short-circuit: if this member already signed this template
  // version, return success immediately without touching storage. This
  // prevents storage/DB drift — e.g. a user who first submitted a typed
  // signature, then retries with a drawn signature, would otherwise upload
  // a PNG to the deterministic path even though sign_waiver_tx would
  // short-circuit and leave the DB row pointing at the old typed signature.
  // Signatures are immutable once recorded, so a short-circuit here is
  // semantically correct. The RPC still has its own idempotency check as a
  // belt-and-suspenders safety net against races.
  const { data: existingSig } = await supabase
    .from("waiver_signatures")
    .select("id")
    .eq("member_id", member.id)
    .eq("template_id", template.id)
    .eq("template_version", template.version)
    .maybeSingle();
  if (existingSig) return { success: true };

  // ── Resolve signature fields ───────────────────────────────────────────────
  let signatureType: "typed" | "drawn" | null = null;
  let typedInitials: string | null = null;
  let signaturePath: string | null = null;

  if (signature?.type === "typed" && signature.initials.trim()) {
    signatureType = "typed";
    typedInitials = signature.initials.trim();
  } else if (signature?.type === "drawn" && signature.dataUrl) {
    // M-8: Validate data URL format, PNG magic bytes, and size
    if (!signature.dataUrl.startsWith("data:image/png;base64,")) {
      return { error: "Invalid signature format. Only PNG images are accepted." };
    }
    const base64 = signature.dataUrl.slice("data:image/png;base64,".length);
    if (!base64) return { error: "Invalid signature image" };

    const buffer = Buffer.from(base64, "base64");

    // Verify PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)
    const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buffer.length < 8 || !PNG_MAGIC.every((b, i) => buffer[i] === b)) {
      return { error: "Invalid PNG signature image." };
    }

    // Max 100 KB — matches the storage bucket's file_size_limit. Our canvas
    // is 400×200 and a typical signature is ~5 KB, so 100 KB is generous.
    // Keeping this aligned with the bucket limit means oversized uploads
    // fail fast here instead of after a wasted round-trip to storage.
    if (buffer.length > 100 * 1024) {
      return { error: "Signature image too large (max 100 KB)." };
    }

    // Deterministic path: one object per (member, template_version).
    // Paired with upsert:true, this makes retries idempotent — a retry
    // overwrites the same object instead of creating an orphan. No
    // cleanup code needed for failed mid-flight uploads.
    const path = `${member.id}/${template.version}.png`;

    // Use service client to bypass RLS for storage upload
    const service = createServiceClient();
    const { error: uploadError } = await service.storage
      .from("signatures")
      .upload(path, buffer, { contentType: "image/png", upsert: true });

    if (uploadError) return { error: `Signature upload failed: ${uploadError.message}` };

    signatureType = "drawn";
    signaturePath = path;
  }

  // Snapshot the waiver body with gym placeholders substituted. The stored
  // template keeps literal [GYM NAME] / [GYM ADDRESS] / [GYM EMAIL] tokens
  // so it stays portable across gym deployments; the rendered and archived
  // copies must carry the real values the member actually saw on screen.
  const profile = await getGymProfile();
  const snapshotMd = substituteWaiverPlaceholders(template.body_md, profile);

  // ── Record signature atomically ────────────────────────────────────────────
  // The waiver_signatures INSERT and the members.waiver_signed_at UPDATE
  // must happen in one transaction so a partial failure cannot leave the
  // member with a signature row but no waiver_signed_at (or vice versa).
  // The RPC also performs an idempotency check so retries do not create
  // duplicate signature rows.
  //
  // Must use service client: a BEFORE UPDATE trigger on members
  // (prevent_member_sensitive_column_update) blocks non-admin users from
  // modifying waiver_signed_at. The trigger detects service role by
  // auth.uid() IS NULL and allows the write through.
  const service = createServiceClient();
  const { error: txError } = await service.rpc("sign_waiver_tx", {
    p_member_id: member.id,
    p_template_id: template.id,
    p_template_version: template.version,
    p_snapshot_md: snapshotMd,
    p_signature_type: signatureType,
    p_typed_initials: typedInitials,
    p_signature_path: signaturePath,
  });
  if (txError) {
    console.error("[signWaiver] tx error:", txError.message);
    return { error: "Failed to record signature. Please try again." };
  }

  return { success: true };
}

/**
 * Generate a time-limited signed URL for a drawn signature image.
 *
 * The signatures bucket is private — only admins and service_role have
 * SELECT. Regular members can't call createSignedUrl from the client.
 * This server action uses the service client to bypass storage RLS and
 * returns a 1-hour signed URL the browser can render in an <img>.
 */
export async function getSignatureImageUrl(
  signaturePath: string
): Promise<{ url: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify the caller owns this signature (path format: <member_id>/<version>.png)
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!member) return { error: "No member record" };

  const ownerPrefix = `${member.id}/`;
  if (!signaturePath.startsWith(ownerPrefix)) {
    return { error: "Access denied" };
  }

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from("signatures")
    .createSignedUrl(signaturePath, 3600);

  if (error || !data?.signedUrl) {
    return { error: error?.message ?? "Failed to generate URL" };
  }

  return { url: data.signedUrl };
}
