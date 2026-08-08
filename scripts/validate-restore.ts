/**
 * Backup-restore validation script (WS9).
 *
 * Run against a fresh Supabase project that was restored from a
 * production backup. Exits 0 if every invariant passes (restore is
 * healthy); exits 1 with a clear per-invariant failure list otherwise.
 *
 * Usage:
 *   # 1. Restore a backup into a throwaway Supabase project
 *   # 2. Copy its URL + service role key into .env.restore
 *   # 3. Run:
 *   npx tsx --env-file=.env.restore scripts/validate-restore.ts
 *
 * The invariants below are deliberately loose — they check "did the
 * important data survive?" not "is every row byte-identical?" A
 * point-in-time restore will have a different transaction tail than
 * the primary; we care about shape, not last-minute-of-write.
 *
 * IMPORTANT: Update the `minCount` thresholds after a large growth
 * event so a legitimate restore doesn't fail because the seed
 * population changed. The intent is to catch "the restore dropped a
 * whole table," not drift.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.RESTORE_SUPABASE_URL ?? "").replace(/^"|"$/g, "");
const SERVICE_KEY = (process.env.RESTORE_SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/^"|"$/g, "");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing RESTORE_SUPABASE_URL or RESTORE_SUPABASE_SERVICE_ROLE_KEY. " +
    "Create .env.restore pointing at the restored project."
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface Invariant {
  table: string;
  minCount: number;
  description: string;
}

/**
 * Invariants to verify. Each is a table + minimum expected row count +
 * human-readable description. Tune `minCount` when the population
 * legitimately changes. On a fresh staging restore, `minCount: 0` is
 * fine — we're checking shape, not volume.
 */
const INVARIANTS: Invariant[] = [
  { table: "members",              minCount: 1,   description: "member records survived" },
  { table: "profiles",             minCount: 1,   description: "auth profiles present" },
  { table: "check_ins",            minCount: 0,   description: "check-in table exists + queryable" },
  { table: "schedule_slots",       minCount: 10,  description: "weekly schedule intact" },
  { table: "class_modalities",     minCount: 3,   description: "class taxonomy seeded" },
  { table: "class_levels",         minCount: 3,   description: "level taxonomy seeded" },
  { table: "class_audiences",      minCount: 3,   description: "audience taxonomy seeded" },
  { table: "membership_plans",     minCount: 1,   description: "at least one plan exists" },
  { table: "waiver_templates",     minCount: 1,   description: "waiver template present" },
  { table: "waiver_signatures",    minCount: 0,   description: "signatures table exists" },
  { table: "audit_logs",           minCount: 0,   description: "audit trail table exists" },
  { table: "site_settings",        minCount: 1,   description: "gym-wide settings present" },
  { table: "instructors",          minCount: 1,   description: "instructor roster intact" },
  // stripe_events is intentionally not checked. The payment integration is gone
  // and nothing writes to that table any more, but it is still in the schema
  // (see the DB-columns note in the migration history) — asserting on a table no
  // feature depends on would just be a restore check that can never fail
  // meaningfully.
  // New hardening-sprint tables — exist post-migration even if empty.
  { table: "admin_mfa_challenges", minCount: 0,   description: "MFA challenge log table exists" },
  { table: "mfa_recovery_codes",   minCount: 0,   description: "recovery codes table exists" },
  { table: "email_suppressions",   minCount: 0,   description: "SES suppressions table exists" },
  { table: "auth_attempt_log",     minCount: 0,   description: "auth-attempt log exists" },
  { table: "data_requests",        minCount: 0,   description: "DSAR queue table exists" },
];

async function main() {
  console.log("\n═══ Supabase restore validation ═══");
  console.log(`Target: ${SUPABASE_URL}`);
  console.log("");

  let failures = 0;
  let passes = 0;

  for (const inv of INVARIANTS) {
    const { count, error } = await db
      .from(inv.table)
      .select("*", { count: "exact", head: true });

    if (error) {
      console.log(`❌ ${inv.table.padEnd(28)} — ERROR: ${error.message}`);
      failures++;
      continue;
    }

    const actual = count ?? 0;
    if (actual >= inv.minCount) {
      console.log(`✓  ${inv.table.padEnd(28)} ${String(actual).padStart(7)} rows (≥${inv.minCount}) — ${inv.description}`);
      passes++;
    } else {
      console.log(`❌ ${inv.table.padEnd(28)} ${String(actual).padStart(7)} rows (want ≥${inv.minCount}) — ${inv.description}`);
      failures++;
    }
  }

  // Supabase internal auth.users row count — the identity store. Can't
  // query via PostgREST directly; use the admin API.
  try {
    const { data: authList, error: authErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (authErr) {
      console.log(`❌ auth.users                    — ERROR: ${authErr.message}`);
      failures++;
    } else if ((authList?.total ?? 0) < 1) {
      console.log(`❌ auth.users                    ${authList?.total ?? 0} users (want ≥1) — identity store must survive restore`);
      failures++;
    } else {
      console.log(`✓  auth.users                    ${String(authList?.total ?? 0).padStart(7)} users — identity store intact`);
      passes++;
    }
  } catch (err) {
    console.log(`❌ auth.users                    — ERROR: ${err instanceof Error ? err.message : String(err)}`);
    failures++;
  }

  console.log("");
  console.log("═══ Summary ═══");
  console.log(`Passed: ${passes}`);
  console.log(`Failed: ${failures}`);

  if (failures === 0) {
    console.log("\n✓ Restore looks healthy. Safe to use.\n");
    process.exit(0);
  }

  console.log("\n⚠ Restore failed validation. DO NOT use this project as a source of truth.\n");
  console.log("Next steps:");
  console.log("  1. Check the Supabase Dashboard restore log for errors");
  console.log("  2. Try restoring from a different backup timestamp");
  console.log("  3. If still failing, contact Supabase support before making this project authoritative\n");
  process.exit(1);
}

main().catch((err) => {
  console.error("\n[fatal]", err);
  process.exit(1);
});
