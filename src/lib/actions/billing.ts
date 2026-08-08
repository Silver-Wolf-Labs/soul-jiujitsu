"use server";

/**
 * Membership self-service server actions for the member portal.
 *
 * Historically this file wrapped a payment processor (hosted billing portal,
 * subscription cancellation with proration). Soul Jiu-Jitsu takes payment in
 * person, so there is no processor to call: what remains is the local
 * membership record, and cancelling is a bookkeeping write plus an audit entry.
 */

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@/lib/audit";

/**
 * Member-facing error copy, from the portal catalogue.
 *
 * The action in this file is called only from the member portal (CurrentPlanCard),
 * so every `error` string here is read by a Spanish-speaking member.
 * getTranslations rather than the hook because a "use server" module can't call
 * hooks.
 */
async function errors() {
  return getTranslations("portal.errors");
}

// ── Cancellation ────────────────────────────────────────────────────────────

/**
 * Cancel the caller's own membership, effective immediately.
 *
 * No notice period and no "you'll be charged once more" branch: those existed
 * because a card was on file and a subscription had to be wound down against a
 * billing cycle. Nothing here charges anyone. If the member has already paid
 * the profe for the current month, honouring the remainder is a conversation at
 * the gym — deliberately not modelled as an automated end-of-period date this
 * code would have to guess.
 *
 * Returns `cancelAt` (always now) so the portal can render the same
 * confirmation shape it always did.
 */
export async function requestCancellation(
  membershipId: number
): Promise<{ cancelAt: string } | { error: string }> {
  const t = await errors();
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return { error: t("notAuthenticated") };

  // Verify ownership
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userData.user.id)
    .single();
  if (!member) return { error: t("memberNotFound") };

  const adminSupabase = createServiceClient();
  const { data: membership } = await adminSupabase
    .from("member_memberships")
    .select("id, member_id, is_comp, status")
    .eq("id", membershipId)
    .eq("member_id", member.id)
    .single();

  if (!membership) return { error: t("membershipNotFound") };
  if (membership.status === "canceled") return { error: t("alreadyCanceled") };

  const canceledAt = new Date().toISOString();

  const { error } = await adminSupabase
    .from("member_memberships")
    .update({ status: "canceled", canceled_at: canceledAt })
    .eq("id", membershipId);

  if (error) {
    console.error("[requestCancellation] update failed:", error.message);
    return { error: t("generic") };
  }

  await logAuditEvent("UPDATE", "member_memberships", String(membershipId), {
    after: { status: "canceled" },
    source: "self_cancellation",
    is_comp: !!membership.is_comp,
  });

  return { cancelAt: canceledAt };
}
