"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";
import { gymToday } from "@/lib/gym-time";
import type { Badge, EarnedBadge } from "@/lib/supabase/types";

// Kept in one place so the admin list and the member join always agree.
const BADGE_FIELDS =
  "id, slug, name, description, icon, tier, category, xp_reward, secret, active, sort_order";

/**
 * Resolve the acting admin's email for attribution on member_badges.awarded_by.
 *
 * Mirrors adminIdentity() in belt-history.ts: the admin who hands out a badge is
 * recorded on the row, because "who gave me this" is part of what makes a
 * hand-awarded badge mean something.
 */
async function adminEmail(): Promise<string> {
  const user = await requireAdmin();
  return user.email ?? "admin";
}

/** The full active badge catalogue, for the admin award picker. */
export async function listBadges(): Promise<Badge[]> {
  await requireAdmin();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("badges")
    .select(BADGE_FIELDS)
    .eq("active", true)
    .order("sort_order");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Badge[];
}

/** The badges a given member has already earned, newest first. */
export async function getMemberBadges(memberId: number): Promise<EarnedBadge[]> {
  await requireAdmin();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("member_badges")
    .select(`awarded_via, awarded_at, note, seen_at, badges (${BADGE_FIELDS})`)
    .eq("member_id", memberId)
    .order("awarded_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? [])
    // A deactivated badge still counts as earned but joins to null — skip those
    // rather than render an empty row.
    .filter((row) => row.badges)
    .map((row) => ({
      badge:       row.badges as unknown as Badge,
      awarded_via: row.awarded_via as "auto" | "manual",
      awarded_at:  row.awarded_at as string,
      note:        (row.note as string | null) ?? null,
      seen_at:     (row.seen_at as string | null) ?? null,
    }));
}

/**
 * Hand a badge to a member — the professor's half of the feature.
 *
 * Goes through the award_badge_manually RPC rather than inserting directly,
 * because the badge row and its XP ledger row have to be written together;
 * a bare insert would award the badge and silently pay 0 XP.
 *
 * Returns `alreadyHad` instead of throwing when the member already has it: the
 * profe wants to be told, not shown an error dialog.
 */
export async function awardBadge(
  memberId: number,
  badgeSlug: string,
  note?: string,
): Promise<{ ok: true; badgeName: string; xpAwarded: number; alreadyHad: boolean } | { ok: false; error: string }> {
  // Deliberately OUTSIDE the try: requireAdmin() signals failure by calling
  // redirect(), which throws NEXT_REDIRECT. Catching that would turn "you're not
  // signed in" into a generic error toast and swallow the redirect.
  const email = await adminEmail();

  try {
    // The RPC is GRANT EXECUTE ... TO service_role only. requireAdmin() inside
    // adminEmail() is the authorization gate before we escalate — same model as
    // belt_history_tx and snapshot_check_in_taxonomy.
    const service = createServiceClient();

    const { data, error } = await service.rpc("award_badge_manually", {
      p_member_id:  memberId,
      p_badge_slug: badgeSlug,
      p_awarded_by: email,
      p_note:       note?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };

    const row = (data?.[0] ?? {}) as Record<string, unknown>;
    const alreadyHad = Boolean(row.already_had);

    if (!alreadyHad) {
      await logAuditEvent("CREATE", "member_badges", String(memberId), {
        badge_slug: badgeSlug,
        xp_awarded: Number(row.xp_awarded ?? 0),
        note:       note?.trim() || null,
      });
    }

    return {
      ok: true,
      badgeName:  String(row.awarded_badge_name ?? badgeSlug),
      xpAwarded:  Number(row.xp_awarded ?? 0),
      alreadyHad,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Take a badge back, clawing back its XP.
 *
 * Exists because a mis-clicked award needs to be undoable — and undoing it has
 * to remove the ledger row too, or the member keeps XP for a badge they no
 * longer hold.
 */
export async function revokeBadge(
  memberId: number,
  badgeId: number,
): Promise<{ ok: true; removed: boolean } | { ok: false; error: string }> {
  await requireAdmin();   // outside the try — see awardBadge

  try {
    const service = createServiceClient();

    const { data, error } = await service.rpc("revoke_member_badge", {
      p_member_id: memberId,
      p_badge_id:  badgeId,
    });
    if (error) return { ok: false, error: error.message };

    const removed = Boolean(data);
    if (removed) {
      await logAuditEvent("DELETE", "member_badges", String(memberId), { badge_id: badgeId });
    }
    return { ok: true, removed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Re-run the automatic badge rules for one member.
 *
 * Useful after a backfill, after adding a badge to the catalogue, or when the
 * kiosk's non-fatal award silently failed. Idempotent — it can only add badges
 * the member has genuinely earned.
 */
export async function reevaluateMemberBadges(
  memberId: number,
): Promise<{ ok: true; awarded: string[] } | { ok: false; error: string }> {
  await requireAdmin();   // outside the try — see awardBadge

  try {
    const service = createServiceClient();
    const today = await gymToday();

    const { data, error } = await service.rpc("evaluate_member_badges", {
      p_member_id: memberId,
      p_today:     today,
    });
    if (error) return { ok: false, error: error.message };

    const awarded = ((data ?? []) as { badge_name: string }[]).map((r) => r.badge_name);
    if (awarded.length > 0) {
      await logAuditEvent("CREATE", "member_badges", String(memberId), {
        source:  "reevaluate",
        awarded,
      });
    }
    return { ok: true, awarded };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
