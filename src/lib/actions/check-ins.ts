"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import { gymToday, gymPgDay } from "@/lib/gym-time";
import { parseUnlockGrace, UNLOCK_GRACE_MS, type KioskUnlockGrace } from "@/lib/kiosk-ui-config";
import { writeCheckIn, type WriteCheckInResult } from "@/lib/check-in-core";

// Re-exported for the kiosk components that already import it from here.
// Types are erased at compile time, so this doesn't create a server action.
export type { AwardedBadge } from "@/lib/check-in-core";

/**
 * Companion cookie to `kiosk_token`. Holds the epoch-ms at which the
 * current unlock grace window ends. Absence means strict mode (no grace).
 * Readable by the client guard indirectly through getKioskUnlockStatus().
 */
const KIOSK_GRACE_COOKIE = "kiosk_grace_until";

// ── Kiosk helpers ────────────────────────────────────────────────────────────
//
// The kiosk runs on unauthenticated devices (no admin Supabase session).
// Every DB call in kiosk actions MUST use the service-role client so RLS
// doesn't silently block reads/writes.  The service client is only used
// server-side in these server actions — never exposed to the browser.

/**
 * Validate the kiosk_token cookie against the stored session token.
 * Throws if invalid — used to protect kiosk-only server actions.
 */
async function requireKioskSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("kiosk_token")?.value;
  if (!token) throw new Error("Kiosk session required");
  const { data } = await createServiceClient()
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.KIOSK_SESSION_TOKEN)
    .single();
  if (!data?.value || data.value !== token) throw new Error("Invalid kiosk session");
}

/** Service client scoped to a kiosk action — call AFTER requireKioskSession(). */
function kioskClient() {
  return createServiceClient();
}

// ── Kiosk auth ────────────────────────────────────────────────────────────────

/**
 * Called from the kiosk PIN entry page.
 * Validates the PIN against site_settings, then issues a session token cookie.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 *
 * When the KIOSK_REQUIRE_ADMIN setting is "true" (the default), the caller
 * must also be signed in as an admin — this prevents anyone who finds the
 * kiosk running on the front desk tablet from unlocking it without an
 * actual staff member present.
 */
export async function unlockKiosk(pin: string): Promise<{ ok: boolean; error?: string }> {
  const service = createServiceClient();

  // Gate 1 of 2: optional admin session check. Lookup the toggle first so
  // the most restrictive path (must-be-admin) always runs before the PIN
  // comparison — otherwise an anonymous user could time-measure the PIN
  // check. Default is "true" (unset behaves like enabled) so an operator
  // has to consciously allow unauthenticated kiosk unlock.
  const { data: requireAdminRow } = await service
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.KIOSK_REQUIRE_ADMIN)
    .maybeSingle();
  // Local variable — do NOT shadow the imported requireAdmin() helper.
  const mustBeAdmin = (requireAdminRow?.value ?? "true").toLowerCase() !== "false";
  if (mustBeAdmin) {
    // Use the user-scoped client (not service role) so we actually read the
    // caller's session. getSession() + a role check on profiles is cheap
    // and fails closed if anything is off.
    const userClient = createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return { ok: false, error: "Admin login required to unlock kiosk." };
    }
    const { data: profile } = await service
      .from("profiles")
      .select("is_admin, role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_admin && profile?.role !== "admin") {
      return { ok: false, error: "Admin login required to unlock kiosk." };
    }
  }

  // Gate 2 of 2: PIN comparison.
  const { data: pinRow } = await service
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.KIOSK_PIN)
    .single();
  const storedPin = pinRow?.value ?? null;
  if (!storedPin || pin !== storedPin) {
    return { ok: false, error: "Incorrect PIN" };
  }

  // Rotate the session token on every successful unlock.
  // upsert guarantees the row exists (handles first-ever unlock).
  const token = crypto.randomUUID();
  const { error: upsertErr } = await service
    .from("site_settings")
    .upsert({ key: SETTINGS_KEYS.KIOSK_SESSION_TOKEN, value: token });

  if (upsertErr) {
    console.error("[unlockKiosk] token upsert failed:", upsertErr.message);
    return { ok: false, error: "Unable to create session. Contact staff." };
  }

  // Set httpOnly cookie valid for 16 hours (covers 5 AM unlock → 9 PM close).
  // sameSite must be "lax" — iOS WebKit has a confirmed bug where "strict"
  // cookies are not reliably sent back in fetch() POST requests (which is
  // how Next.js server actions work under the hood).
  //
  // Path is "/" rather than "/kiosk" — some browsers and CDN edge caches
  // handle path-scoped cookies inconsistently on sub-path navigation
  // (e.g. /kiosk → /kiosk/checkin) and will silently omit the cookie,
  // which manifests as the PIN accepting but the check-in page bouncing
  // back to the PIN screen. Scoping to "/" costs us nothing — the middleware
  // only consults this cookie on /kiosk/checkin routes anyway.
  const cookieStore = await cookies();
  cookieStore.set("kiosk_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 16,
  });

  // Defense in depth: once this device has a live kiosk_token, it's no
  // longer meant to be an admin workstation. By default we sign the admin
  // out server-side so their Supabase cookies get cleared on this device.
  // Gated on `kiosk_logout_admin_on_unlock` so setup/development workflows
  // can keep the admin session alive across unlocks. Secure-by-default:
  // only an explicit "false" disables the sign-out.
  const { data: logoutRow } = await service
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.KIOSK_LOGOUT_ADMIN_ON_UNLOCK)
    .maybeSingle();
  const logoutOnUnlock = (logoutRow?.value ?? "true").toLowerCase() !== "false";
  if (logoutOnUnlock) {
    try {
      const userClient = createClient();
      // `scope: "local"` matters. supabase-js defaults `signOut()` to
      // "global", which revokes every refresh token the user holds — so
      // unlocking the front-desk tablet would also sign the coach out of
      // their own phone and laptop, mid-session, with no explanation. What
      // this setting is for is clearing the session *on this device*, and
      // "local" is exactly that: it deletes the cookies this request owns
      // and leaves other devices alone. Nothing is lost defensively —
      // middleware blocks /admin on any device holding a kiosk_token.
      await userClient.auth.signOut({ scope: "local" });
    } catch (signOutErr) {
      // Non-fatal — the kiosk unlock succeeded, the middleware block still
      // protects /admin access on this device even if the cookie lingers.
      console.warn("[unlockKiosk] admin sign-out failed:", signOutErr);
    }
  }

  // Companion "grace" cookie. When the admin has selected a non-strict
  // unlock grace (4h / 8h / 16h), write the epoch-ms at which grace ends.
  // The checkin guard reads this via getKioskUnlockStatus() — the cookie is
  // httpOnly so the client can't inflate its own session by editing it.
  const { data: graceRow } = await service
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.KIOSK_UNLOCK_GRACE)
    .maybeSingle();
  const grace: KioskUnlockGrace = parseUnlockGrace(graceRow?.value);
  if (grace !== "strict") {
    const graceMs = UNLOCK_GRACE_MS[grace];
    cookieStore.set(KIOSK_GRACE_COOKIE, String(Date.now() + graceMs), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(graceMs / 1000),
    });
  } else {
    // Clear any stale grace cookie from a previous non-strict session so
    // switching from "8h" → "strict" takes effect on the next unlock
    // without leaving a dangling grace window behind.
    cookieStore.set(KIOSK_GRACE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return { ok: true };
}

export async function lockKiosk() {
  // Delete cookies first (instant) — this is the access gate. Must specify
  // the same path used when the cookie was set, otherwise the browser
  // keeps the old cookie around and the lock is a no-op until expiry.
  const cookieStore = await cookies();
  const clearOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  cookieStore.set("kiosk_token", "", clearOpts);
  // Grace cookie goes too — explicit lock should always drop any
  // persistence window from a previous unlock.
  cookieStore.set(KIOSK_GRACE_COOKIE, "", clearOpts);

  // Fire-and-forget: invalidate DB token so stolen cookies can't be reused.
  // Not awaited so the lock action feels instant.
  const service = createServiceClient();
  service
    .from("site_settings")
    .update({ value: "" })
    .eq("key", SETTINGS_KEYS.KIOSK_SESSION_TOKEN)
    .then(({ error }) => {
      if (error) console.error("[lockKiosk] token invalidation failed:", error.message);
    });
}

// ── Kiosk unlock status ───────────────────────────────────────────────────────

/**
 * Describes whether the current device's kiosk session is valid, and — in
 * non-strict policies — how much of the grace window remains.
 *
 * `cookieActive` is the ground truth "is the kiosk_token cookie present and
 * valid on this device". Everything else is policy on top.
 */
export interface KioskUnlockStatus {
  /** True when the kiosk_token cookie exists AND matches the stored session token. */
  cookieActive: boolean;
  /** "strict" → always re-PIN on refresh. "grace" → grace cookie in effect. */
  mode: "strict" | "grace";
  /** Epoch-ms when grace expires, or null in strict mode / when expired. */
  graceUntil: number | null;
}

/**
 * Tells the kiosk checkin page whether to render, redirect, or still consume
 * the sessionStorage one-shot flag (strict mode). Purposely non-throwing —
 * the guard handles each branch explicitly.
 */
export async function getKioskUnlockStatus(): Promise<KioskUnlockStatus> {
  const cookieStore = await cookies();
  const token = cookieStore.get("kiosk_token")?.value ?? "";

  // Cheap short-circuit: no cookie, no session.
  if (!token) {
    return { cookieActive: false, mode: "strict", graceUntil: null };
  }

  const service = createServiceClient();

  // Validate the token AND read the grace policy in one round-trip.
  const { data } = await service
    .from("site_settings")
    .select("key,value")
    .in("key", [
      SETTINGS_KEYS.KIOSK_SESSION_TOKEN,
      SETTINGS_KEYS.KIOSK_UNLOCK_GRACE,
    ]);
  const rows = (data ?? []) as { key: string; value: string }[];
  const get = (k: string) => rows.find(r => r.key === k)?.value ?? "";

  const storedToken = get(SETTINGS_KEYS.KIOSK_SESSION_TOKEN);
  const cookieActive = Boolean(storedToken) && storedToken === token;
  if (!cookieActive) {
    return { cookieActive: false, mode: "strict", graceUntil: null };
  }

  const grace = parseUnlockGrace(get(SETTINGS_KEYS.KIOSK_UNLOCK_GRACE));
  if (grace === "strict") {
    return { cookieActive: true, mode: "strict", graceUntil: null };
  }

  // Non-strict — consult the grace cookie. If missing (e.g. admin changed
  // the policy to grace AFTER a strict unlock) we stay strict for this
  // session; the next unlock will issue the grace cookie properly.
  const graceRaw = cookieStore.get(KIOSK_GRACE_COOKIE)?.value ?? "";
  const graceUntil = Number(graceRaw);
  if (!Number.isFinite(graceUntil) || graceUntil <= Date.now()) {
    return { cookieActive: true, mode: "strict", graceUntil: null };
  }
  return { cookieActive: true, mode: "grace", graceUntil };
}

// ── Member lookup ─────────────────────────────────────────────────────────────

export interface KioskMember {
  id: number;
  first_name: string;
  last_name: string;
  status: string;
  total_check_ins: number;
  birth_month: number | null;
  birth_year: number | null;
  gender: string | null;
}

/**
 * Look up members by the last 4 digits of their phone number.
 * Returns up to 5 matches so the member can confirm who they are.
 */
export async function lookupMemberByPhone(last4: string): Promise<{ members: KioskMember[]; error?: string }> {
  await requireKioskSession();

  if (!/^\d{4}$/.test(last4)) {
    return { members: [], error: "Enter 4 digits" };
  }

  const supabase = kioskClient();

  // Allowed statuses are configurable via site_settings
  // (comma-separated, e.g. "active" or "active,trial"). Defaults to "active".
  const { data: statusRow } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.KIOSK_ALLOWED_STATUSES)
    .single();
  const raw = statusRow?.value ?? null;
  const allowedStatuses = raw
    ? raw.split(",").map((s: string) => s.trim()).filter(Boolean)
    : ["active"];

  const { data, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, status, phone, birth_month, birth_year, gender, check_ins(count)")
    .in("status", allowedStatuses)
    .ilike("phone", `%${last4}`)
    .limit(5);

  if (error) {
    console.error("[lookupMemberByPhone] DB error:", error.message);
    return { members: [], error: "Lookup failed. Please try again or contact staff." };
  }

  const members: KioskMember[] = (data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as number,
    first_name: m.first_name as string,
    last_name: m.last_name as string,
    status: m.status as string,
    total_check_ins: ((m.check_ins as { count: number }[])?.[0]?.count) ?? 0,
    birth_month: (m.birth_month as number) ?? null,
    birth_year: (m.birth_year as number) ?? null,
    gender: (m.gender as string) ?? null,
  }));

  return { members };
}

// ── Today's classes ───────────────────────────────────────────────────────────

/**
 * Audience gate attached to a kiosk class. Matches a row in
 * `schedule_slot_audiences` joined to `class_audiences`. The kiosk reads
 * this array instead of the legacy scalar columns (min_age / max_age /
 * allowed_gender / invite_only) — those stay in the DB until Phase 3 but
 * aren't consulted by `checkRestrictions` anymore.
 */
export interface KioskClassAudience {
  id: number;
  kind: "age" | "gender" | "rank" | "access";
  name: string;
  min_age: number | null;
  max_age: number | null;
  gender: "female" | "male" | null;
}

export interface KioskClass {
  id: number | null;   // null for manually-added classes
  name: string;
  start_time: string;  // "HH:MM:SS"
  /** Current modality display name for the card label. Populated from the
   *  slot's `modality_id` → `class_modalities` join. Nullable only for
   *  manually-added classes (id=null) that don't carry a slot FK. */
  modality_name: string | null;
  /** Current modality slug — stable key used for restriction UI copy and
   *  future modality-specific eligibility rules. */
  modality_slug: string | null;
  /** Typed audience gates for eligibility checks (§3.4 of the LLD). Empty
   *  array = open class. */
  audiences: KioskClassAudience[];
}

/**
 * Returns today's schedule slots for the kiosk class selector.
 *
 * Post-taxonomy migration (WS4): reads modality + audiences from the new
 * junction tables. The legacy scalar columns (min_age / max_age /
 * allowed_gender / invite_only) are no longer consulted — the backfill
 * already normalized them into `schedule_slot_audiences` so kiosk
 * eligibility is consistent for both pre- and post-migration slots.
 */
export async function getTodaysClasses(): Promise<KioskClass[]> {
  await requireKioskSession();

  const pgDay = await gymPgDay();

  const supabase = kioskClient();
  const { data } = await supabase
    .from("schedule_slots")
    .select(`
      id,
      title,
      start_time,
      modality:class_modalities!left(name, slug),
      slot_audiences:schedule_slot_audiences(
        audience:class_audiences!inner(id, kind, name, min_age, max_age, gender)
      )
    `)
    .eq("day_of_week", pgDay)
    .eq("active", true)
    .order("start_time");

  type Row = {
    id: number;
    title: string;
    start_time: string;
    modality: { name: string; slug: string } | { name: string; slug: string }[] | null;
    slot_audiences: { audience: {
      id: number;
      kind: "age" | "gender" | "rank" | "access";
      name: string;
      min_age: number | null;
      max_age: number | null;
      gender: "female" | "male" | null;
    } | null }[] | null;
  };

  return ((data as Row[] | null) ?? []).map((s) => {
    const modalityRow = Array.isArray(s.modality) ? s.modality[0] : s.modality;
    const audiences: KioskClassAudience[] = (s.slot_audiences ?? [])
      .map(j => j.audience)
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map(a => ({
        id: a.id,
        kind: a.kind,
        name: a.name,
        min_age: a.min_age,
        max_age: a.max_age,
        gender: a.gender,
      }));
    return {
      id: s.id,
      name: s.title,
      start_time: s.start_time,
      modality_name: modalityRow?.name ?? null,
      modality_slug: modalityRow?.slug ?? null,
      audiences,
    };
  });
}

/**
 * Returns the set of class keys the member has already checked into today.
 * Keys match the kiosk UI: slot id when available, class_name otherwise.
 * This aligns with recordCheckIn's dedup logic (slot id → class_name fallback).
 */
export async function getMemberTodayCheckIns(memberId: number): Promise<string[]> {
  await requireKioskSession();
  const supabase = kioskClient();
  const today = await gymToday();
  const { data } = await supabase
    .from("check_ins")
    .select("schedule_slot_id, class_name")
    .eq("member_id", memberId)
    .eq("class_date", today);

  return (data ?? []).map(row =>
    row.schedule_slot_id != null
      ? String(row.schedule_slot_id)
      : row.class_name
  );
}

// ── Record check-in ───────────────────────────────────────────────────────────

export async function recordCheckIn(
  memberId: number,
  className: string,
  scheduleSlotId?: number | null
): Promise<WriteCheckInResult> {
  await requireKioskSession();
  return writeCheckIn(kioskClient(), {
    memberId,
    className,
    scheduleSlotId,
    source: "kiosk",
  });
}

/**
 * Kiosk-side self-undo: delete a check-in the member just made at the kiosk.
 *
 * The caller must present a valid kiosk session AND the check-in's owning
 * memberId — we use that memberId as an ownership fence so one member
 * can't undo another member's check-in through this surface. We also gate
 * to today's class_date so stale success screens / replayed requests can't
 * reach back in time.
 */
export async function undoKioskCheckIn(
  memberId: number,
  checkInId: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireKioskSession();

  const supabase = kioskClient();
  const today = await gymToday();

  const { data, error: readErr } = await supabase
    .from("check_ins")
    .select("id, member_id, class_date, class_name")
    .eq("id", checkInId)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };
  if (!data) return { ok: false, error: "Check-in not found." };
  if (data.member_id !== memberId) return { ok: false, error: "Not your check-in." };
  if (data.class_date !== today) return { ok: false, error: "Can only undo today's check-ins." };

  const { error } = await supabase.from("check_ins").delete().eq("id", checkInId);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent("DELETE", "check_ins", String(checkInId), {
    source: "kiosk-undo",
    member_id: memberId,
    class_name: data.class_name,
  });
  return { ok: true };
}

// ── Kiosk member stats ────────────────────────────────────────────────────────

export interface KioskMemberStats {
  classes_this_month: number;
  month_rank: number;        // 1-based (1 = most classes this month)
  month_total: number;       // members with ≥1 class this month
  week_streak: number;       // consecutive weeks with ≥1 class (most recent run)
  all_time_classes: number;
  classes_this_week: number;
  avg_per_week: number;      // last 28 days / 4, rounded to 1 decimal
  belt: string;
  stripes: number;
  joined_at: string | null;  // ISO timestamp from members.created_at
  last_class_name: string | null;
  last_class_date: string | null;  // ISO date "YYYY-MM-DD"
}

/**
 * Returns motivational stats for the kiosk profile card.
 * Requires an active kiosk session.
 */
export async function getKioskMemberStats(memberId: number): Promise<KioskMemberStats> {
  await requireKioskSession();

  const supabase = kioskClient();
  const today = await gymToday();

  const [statsResult, memberResult] = await Promise.all([
    supabase.rpc("get_member_motivational_stats", { p_member_id: memberId, p_today: today }),
    supabase.from("members").select("belt, stripes, created_at").eq("id", memberId).single(),
  ]);

  const s = (statsResult.data?.[0] ?? {}) as Record<string, unknown>;

  return {
    classes_this_month: Number(s.classes_this_month ?? 0),
    month_rank:         Number(s.month_rank ?? 1),
    month_total:        Number(s.month_total ?? 0),
    week_streak:        Number(s.week_streak ?? 0),
    all_time_classes:   Number(s.all_time_classes ?? 0),
    classes_this_week:  Number(s.classes_this_week ?? 0),
    avg_per_week:       Math.round((Number(s.classes_last_28d ?? 0) / 4) * 10) / 10,
    belt:               memberResult.data?.belt ?? "white",
    stripes:            memberResult.data?.stripes ?? 0,
    joined_at:          memberResult.data?.created_at ?? null,
    last_class_name:    (s.last_class_name as string | null) ?? null,
    last_class_date:    (s.last_class_date as string | null) ?? null,
  };
}

// ── Gym-wide rankings ────────────────────────────────────────────────────────

export interface GymRankings {
  month:   { rank: number; total: number };
  streak:  { rank: number; total: number };
  alltime: { rank: number; total: number };
  week:    { rank: number; total: number };
}

/**
 * Returns the current member's rank vs the gym for each of the 4 stat
 * categories.  ONLY rank + total are returned — no other member's data
 * ever leaves the database.
 */
export async function getGymRankings(memberId: number): Promise<GymRankings> {
  await requireKioskSession();

  const supabase = kioskClient();
  const today = await gymToday();

  const { data, error } = await supabase.rpc("get_member_gym_rankings", {
    p_member_id: memberId,
    p_today: today,
  });

  if (error) {
    console.error("[getGymRankings] RPC error:", error.message);
    throw new Error(error.message);
  }

  const r = (data?.[0] ?? {}) as Record<string, unknown>;
  return {
    month:   { rank: Number(r.month_rank   ?? 1), total: Number(r.month_total   ?? 0) },
    streak:  { rank: Number(r.streak_rank  ?? 1), total: Number(r.streak_total  ?? 0) },
    alltime: { rank: Number(r.alltime_rank ?? 1), total: Number(r.alltime_total ?? 0) },
    week:    { rank: Number(r.week_rank    ?? 1), total: Number(r.week_total    ?? 0) },
  };
}

// ── Admin-initiated check-in ──────────────────────────────────────────────────

export async function adminRecordCheckIn(
  memberId: number,
  className: string,
  classDate: string,
  scheduleSlotId?: number | null
): Promise<void> {
  await requireAdmin();

  // Service-role rather than the admin's own client: the taxonomy snapshot RPC
  // is `GRANT EXECUTE ... TO service_role` only (mirrors belt_history_tx's
  // security model). requireAdmin() above is the gate before we escalate.
  const result = await writeCheckIn(createServiceClient(), {
    memberId,
    className,
    scheduleSlotId,
    source: "admin",
    // Staff sometimes record attendance the morning after, so unlike the kiosk
    // and portal paths this one lets the caller name the date.
    classDate,
  });
  if (!result.ok) throw new Error(result.error ?? "Check-in failed");

  await logAuditEvent("CREATE", "check_ins", String(memberId), { class_name: className, class_date: classDate });
}

export async function adminDeleteCheckIn(checkInId: number): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase.from("check_ins").delete().eq("id", checkInId);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "check_ins", String(checkInId), {});
}
