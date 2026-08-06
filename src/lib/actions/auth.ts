"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getGymProfile } from "@/lib/gym-profile";
import { substituteWaiverPlaceholders } from "@/lib/waiver-substitute";
import { BeltColor } from "@/lib/constants";
import type { MemberStatus } from "@/lib/supabase/types";

// Belt/stripes can be self-declared during signup (so transfer students
// don't start at white 0-0), but are locked by the
// prevent_member_sensitive_column_update trigger afterwards — only an
// admin can change them once the account exists. Validate server-side
// here so a tampered client cannot set a nonsense belt value.
const VALID_BELTS = new Set<string>(Object.values(BeltColor));

function normalizeBelt(input: string | null | undefined): string {
  if (!input) return BeltColor.White;
  const lower = input.toLowerCase().trim();
  return VALID_BELTS.has(lower) ? lower : BeltColor.White;
}

function normalizeStripes(input: number | null | undefined): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0;
  // Stripes run 0..4 (a 5th stripe promotes to the next belt).
  return Math.max(0, Math.min(4, Math.floor(n)));
}

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RULES = [
  { test: (p: string) => p.length >= PASSWORD_MIN_LENGTH, msg: "Password must be at least 8 characters." },
  { test: (p: string) => /[A-Z]/.test(p), msg: "Password must contain an uppercase letter." },
  { test: (p: string) => /[a-z]/.test(p), msg: "Password must contain a lowercase letter." },
  { test: (p: string) => /[0-9]/.test(p), msg: "Password must contain a number." },
];

export async function createMemberProfile(data: {
  userId: string;
  password: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship?: string | null;
  communication_opt_in: boolean;
  // Demographics
  birth_month?: number | null;
  birth_year?: number | null;
  gender?: string | null;
  // Optional training background — belt/stripes are ignored (always white/0 for new members)
  belt?: string | null;
  stripes?: number | null;
  belt_awarded_at?: string | null;
  training_started_at?: string | null;
  // Waiver (signed during signup) — snapshot is derived server-side from
  // the canonical template row, not accepted from the client.
  waiver_template_id?: number | null;
  waiver_template_version?: number | null;
  // Drawn signature captured in JoinForm step 2 (data: URL, PNG base64).
  // Optional — left null in test flows or if no waiver template is active.
  waiver_signature_data_url?: string | null;
}): Promise<{ success: true } | { error: string }> {
  // L-1: Server-side password validation
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(data.password)) return { error: rule.msg };
  }

  const adminSupabase = createServiceClient();

  // M-6: Verify the userId matches a real, recently-created auth user
  const { data: authUser, error: authErr } = await adminSupabase.auth.admin.getUserById(data.userId);
  if (authErr || !authUser?.user) {
    return { error: "Invalid user session. Please try signing up again." };
  }

  const email = data.email.toLowerCase().trim();
  const userId = data.userId;

  // Defense-in-depth: the caller supplies both userId and email from the
  // client-side signUp response. An attacker who somehow learns a fresh
  // auth user's uuid (before that user has a members row) could otherwise
  // call this action with attacker-controlled profile fields. Requiring
  // the caller's email to match the auth user's email closes that gap —
  // the attacker would need to know the victim's email AND uuid, and the
  // planted profile would still carry the victim's real email.
  const authEmail = (authUser.user.email ?? "").toLowerCase().trim();
  if (!authEmail || authEmail !== email) {
    return { error: "Email does not match the signed-up account." };
  }

  const status: MemberStatus = "prospect";

  // Waiver snapshot: re-derive server-side instead of trusting the
  // client-supplied body_md. The join page substitutes [GYM NAME] /
  // [GYM ADDRESS] / [GYM EMAIL] before sending the template to the
  // client, but a tampered client could alter what it sends back. Look
  // up the canonical template row ourselves and substitute with the
  // current gym profile so the stored snapshot is authoritative.
  let waiverSnapshotMd: string | null = null;
  if (data.waiver_template_id && data.waiver_template_version) {
    const { data: tmplRow } = await adminSupabase
      .from("waiver_templates")
      .select("body_md, version")
      .eq("id", data.waiver_template_id)
      .single();
    if (tmplRow && tmplRow.version === data.waiver_template_version) {
      const profile = await getGymProfile();
      waiverSnapshotMd = substituteWaiverPlaceholders(tmplRow.body_md, profile);
    }
  }

  // Validate and upload the drawn signature BEFORE calling the RPC. If
  // upload fails we never enter the transactional flow and the auth user
  // stays clean for a retry. If the RPC later fails we'll compensate-delete
  // the orphaned signature object along with the auth user.
  //
  // We don't know the member_id yet (the RPC mints it), so stage the
  // upload under the auth userId prefix first, then rename into the
  // member path after the RPC returns. This keeps the bucket layout
  // consistent with the rest of the app (`${member_id}/<version>.png`).
  let stagedSignaturePath: string | null = null;
  let finalSignaturePath: string | null = null;
  const signatureType: "drawn" | null =
    data.waiver_template_id && data.waiver_signature_data_url ? "drawn" : null;

  if (signatureType === "drawn" && data.waiver_signature_data_url) {
    const dataUrl = data.waiver_signature_data_url;
    if (!dataUrl.startsWith("data:image/png;base64,")) {
      return { error: "Invalid signature format. Only PNG images are accepted." };
    }
    const base64 = dataUrl.slice("data:image/png;base64,".length);
    if (!base64) return { error: "Invalid signature image." };
    const buffer = Buffer.from(base64, "base64");
    const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buffer.length < 8 || !PNG_MAGIC.every((b, i) => buffer[i] === b)) {
      return { error: "Invalid PNG signature image." };
    }
    if (buffer.length > 100 * 1024) {
      return { error: "Signature image too large (max 100 KB)." };
    }
    // Staging path under the auth uid — unguessable, collision-free.
    stagedSignaturePath = `_signup/${userId}/${data.waiver_template_version ?? 1}.png`;
    const { error: uploadErr } = await adminSupabase.storage
      .from("signatures")
      .upload(stagedSignaturePath, buffer, { contentType: "image/png", upsert: true });
    if (uploadErr) {
      return { error: `Signature upload failed: ${uploadErr.message}` };
    }
  }

  // All writes (members insert + optional waiver signature + waiver_signed_at
  // update) happen atomically inside create_member_profile_tx. The function
  // is idempotent on user_id so retries after a transient failure are safe
  // and will not produce duplicate rows.
  const normalizedBelt = normalizeBelt(data.belt);
  const normalizedStripes = normalizeStripes(data.stripes);
  const { data: rpcData, error: rpcError } = await adminSupabase.rpc(
    "create_member_profile_tx",
    {
      p_user_id: userId,
      p_first_name: data.first_name,
      p_last_name: data.last_name,
      p_email: email,
      p_phone: data.phone || null,
      p_status: status,
      p_emergency_contact_name: data.emergency_contact_name || null,
      p_emergency_contact_phone: data.emergency_contact_phone || null,
      p_emergency_contact_relationship: data.emergency_contact_relationship || null,
      p_communication_opt_in: data.communication_opt_in,
      p_birth_month: data.birth_month || null,
      p_birth_year: data.birth_year || null,
      p_gender: data.gender || null,
      // Self-declared belt/stripes (validated above). The post-signup update
      // trigger prevents members from changing these again, so an admin must
      // verify and correct at the first class.
      p_belt: normalizedBelt,
      p_stripes: normalizedStripes,
      p_belt_awarded_at: data.belt_awarded_at || null,
      p_training_started_at: data.training_started_at || null,
      p_waiver_template_id: data.waiver_template_id ?? null,
      p_waiver_template_version: data.waiver_template_version ?? null,
      p_waiver_snapshot_md: waiverSnapshotMd,
      // Pass the staged path if we have one. We'll move the object to its
      // final `${member_id}/<version>.png` location below and update the row
      // so downstream consumers (profile page, admin detail) can render it.
      p_waiver_signature_type: signatureType,
      p_waiver_typed_initials: null,
      p_waiver_signature_path: stagedSignaturePath,
    },
  );

  if (rpcError) {
    // Compensating action: delete the auth user so signup can be retried
    // cleanly. The RPC is transactional so nothing was written to members
    // or waiver_signatures, but the auth user from the earlier step is now
    // orphaned and must be removed. Log both failures so we can reap any
    // stragglers out-of-band if the delete itself also fails.
    console.error("createMemberProfile: RPC failed", rpcError);
    // Also reap any staged signature object left behind so we don't
    // accumulate orphaned blobs when signup retries.
    if (stagedSignaturePath) {
      await adminSupabase.storage
        .from("signatures")
        .remove([stagedSignaturePath])
        .catch((e) => console.error("createMemberProfile: signature cleanup failed", e));
    }
    const { error: deleteErr } = await adminSupabase.auth.admin.deleteUser(userId);
    if (deleteErr) {
      console.error(
        "createMemberProfile: auth user cleanup failed; orphaned auth user",
        { userId, deleteErr },
      );
    }
    // L-2: Don't expose raw DB error to client
    return { error: "Registration failed. Please try again." };
  }

  // The RPC returned the minted member_id. If a signature was staged,
  // move it from the auth-uid-prefixed staging path into the canonical
  // `${member_id}/<version>.png` location and update the DB row to match.
  // Failure here is not fatal (the member account is already usable and
  // the row still references the staged blob), but we log so an admin can
  // repair the path if needed.
  //
  // Idempotency: when the RPC returns already_existed=true it means a
  // previous call for this user already wrote the member row + signature
  // and moved the blob; we must still clean up the fresh staging upload
  // from *this* call so we don't leak orphan objects on retries.
  const rpcResult = rpcData as { member_id: number; already_existed: boolean } | null;
  const memberId = rpcResult?.member_id ?? null;
  if (
    memberId !== null &&
    stagedSignaturePath &&
    signatureType === "drawn"
  ) {
    if (rpcResult?.already_existed) {
      // Row already has the canonical signature — just discard the stage.
      await adminSupabase.storage
        .from("signatures")
        .remove([stagedSignaturePath])
        .catch((e) => console.error(
          "createMemberProfile: orphan stage cleanup failed (already_existed branch)",
          e,
        ));
    } else {
      const version = data.waiver_template_version ?? 1;
      finalSignaturePath = `${memberId}/${version}.png`;
      const { error: moveErr } = await adminSupabase.storage
        .from("signatures")
        .move(stagedSignaturePath, finalSignaturePath);
      if (moveErr) {
        console.error("createMemberProfile: signature move failed", {
          stagedSignaturePath,
          finalSignaturePath,
          moveErr,
        });
      } else {
        const { error: updErr } = await adminSupabase
          .from("waiver_signatures")
          .update({ signature_path: finalSignaturePath })
          .eq("member_id", memberId)
          .eq("template_version", version);
        if (updErr) {
          console.error("createMemberProfile: signature_path update failed", updErr);
        }
      }
    }
  }

  // Item 1: seed belt_history so transfer students who self-declared a
  // non-white belt or stripes don't start with an empty promotion log.
  // White + 0 stripes is the default and intentionally produces no row
  // (nothing to celebrate yet). Failures here are non-fatal — the member
  // account is already usable, an admin can backfill via the promotion UI.
  if (
    memberId !== null &&
    !rpcResult?.already_existed &&
    (normalizedBelt !== BeltColor.White || normalizedStripes > 0)
  ) {
    const { error: beltHistErr } = await adminSupabase.from("belt_history").insert({
      member_id: memberId,
      belt: normalizedBelt,
      stripes: normalizedStripes,
      event_type: "correction",
      notes: "Self-declared at signup — pending admin verification.",
      promoted_by: null,
      promoted_at: data.belt_awarded_at || new Date().toISOString(),
    });
    if (beltHistErr) {
      console.error("createMemberProfile: belt_history seed failed", beltHistErr);
    }
  }

  return { success: true };
}
