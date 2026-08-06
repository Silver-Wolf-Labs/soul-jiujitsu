/**
 * Unseed companion for `seed_analytics.ts`.
 *
 * Removes ONLY the synthetic fixture data written by the analytics seed
 * script. The script identifies fixture rows by the `@souljj.test` email
 * domain + `555-0xxx` phone range. Canonical staff (`@souljj.team`),
 * real users, and all historical data outside that convention are left
 * untouched.
 *
 * Ordering matters for FK integrity:
 *   1. check_in_instructors    (junction — cascades would also work but
 *      we delete explicitly for clarity + to keep query counts bounded)
 *   2. check_ins
 *   3. member_memberships
 *   4. members                 (the lynchpin — everything above keys
 *      here by member_id)
 *
 * Instructors + schedule_slots are NOT touched — those are real content
 * managed by the bootstrap script and the admin UI. The schedule stays
 * assigned; re-running the seed repopulates check-ins against the
 * existing roster.
 *
 * Run:
 *   npx tsx --env-file=.env.local supabase/unseed_analytics.ts
 *   npx tsx --env-file=.env.local supabase/unseed_analytics.ts --dry-run
 *
 * Safe to re-run — subsequent invocations find zero rows and no-op.
 */

import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^"|"$/g, "");
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/^"|"$/g, "");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const SEED_EMAIL_DOMAIN = "souljj.test";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function log(section: string, msg: string): void {
  console.log(`[${section}] ${msg}`);
}

async function main() {
  const started = Date.now();
  if (DRY_RUN) log("dry-run", "No rows will be deleted. Showing counts only.");

  // 1. Find seed members.
  const { data: seedMembers, error: memErr } = await db
    .from("members")
    .select("id")
    .like("email", `%@${SEED_EMAIL_DOMAIN}`);
  if (memErr) throw new Error(`list seed members: ${memErr.message}`);
  const memberIds = (seedMembers ?? []).map((m) => m.id as number);
  log("members", `Matched ${memberIds.length} seed members (@${SEED_EMAIL_DOMAIN}).`);

  if (memberIds.length === 0) {
    log("done", "Nothing to unseed.");
    return;
  }

  // 2. Find their check-ins so we can nuke junction rows first.
  const { data: checkIns, error: ciErr } = await db
    .from("check_ins")
    .select("id")
    .in("member_id", memberIds);
  if (ciErr) throw new Error(`list seed check-ins: ${ciErr.message}`);
  const checkInIds = (checkIns ?? []).map((r) => r.id as number);
  log("check-ins", `Matched ${checkInIds.length} check-ins from seed members.`);

  if (DRY_RUN) {
    log("dry-run", "Would delete all of the above. Re-run without --dry-run to apply.");
    return;
  }

  // 3. Delete check_in_instructors rows (chunk the `in` list — avoid URL
  //    length limits on big fixtures).
  if (checkInIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < checkInIds.length; i += CHUNK) {
      const slice = checkInIds.slice(i, i + CHUNK);
      const { error } = await db.from("check_in_instructors").delete().in("check_in_id", slice);
      if (error) throw new Error(`delete check_in_instructors: ${error.message}`);
    }
    log("check-in-instructors", `Deleted attribution rows for ${checkInIds.length} check-ins.`);
  }

  // 4. Delete check-ins themselves.
  {
    const CHUNK = 500;
    for (let i = 0; i < memberIds.length; i += CHUNK) {
      const slice = memberIds.slice(i, i + CHUNK);
      const { error } = await db.from("check_ins").delete().in("member_id", slice);
      if (error) throw new Error(`delete check_ins: ${error.message}`);
    }
    log("check-ins", `Deleted ${checkInIds.length} check-ins.`);
  }

  // 5. Delete memberships.
  {
    const { error } = await db.from("member_memberships").delete().in("member_id", memberIds);
    if (error) throw new Error(`delete member_memberships: ${error.message}`);
    log("memberships", `Deleted for ${memberIds.length} seed members.`);
  }

  // 6. Delete members last — everything else now dereferences them.
  {
    const { error } = await db.from("members").delete().in("id", memberIds);
    if (error) throw new Error(`delete members: ${error.message}`);
    log("members", `Deleted ${memberIds.length} seed members.`);
  }

  log("done", `Complete in ${Math.round((Date.now() - started) / 1000)}s.`);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
