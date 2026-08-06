#!/usr/bin/env npx tsx
/**
 * Permanently delete a user and all associated records by email.
 *
 * Usage:
 *   npx tsx scripts/delete-user.ts <email>
 *   npx tsx scripts/delete-user.ts <email> --dry-run
 *   npx tsx scripts/delete-user.ts <email> --yes     # skip confirmation
 *
 * What it deletes (in order):
 *   1. belt_history                  (cascades from members)
 *   2. check_ins                     (cascades from members)
 *   3. waiver_signatures             (cascades from members)
 *   4. member_memberships            (cascades from members)
 *   5. member_purchases              (cascades from members)
 *   6. archived_waiver_signatures    (by email — legal archive, also purged)
 *   7. members row                   (triggers cascades above)
 *   8. profiles                      (cascades from auth.users)
 *   9. auth.users row                (Supabase Auth)
 *  10. subscribers                   (newsletter/sms by email value)
 *  11. contact_submissions           (contact form by email)
 *
 * NOT deleted (foreign keys are ON DELETE SET NULL):
 *   - audit_logs.user_id             → set to null (history preserved)
 *   - assets.uploaded_by             → set to null
 *   - plan_price_history.changed_by  → set to null
 *
 * NOT touched:
 *   - Stripe customer (delete manually in Stripe Dashboard if needed)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (admin privileges).
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { createClient } from "@supabase/supabase-js";

// ── Env loading ──────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!match) continue;
    let [, key, value] = match;
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Strip trailing literal backslash-n sequences (some env files have them)
    value = value.replace(/\\n$/, "").trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const rawEmail = args.find((a) => !a.startsWith("--"))?.toLowerCase().trim();
const dryRun = args.includes("--dry-run");
const skipConfirm = args.includes("--yes");

if (!rawEmail) {
  console.error("Usage: npx tsx scripts/delete-user.ts <email> [--dry-run] [--yes]");
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
  console.error(`Invalid email: ${rawEmail}`);
  process.exit(1);
}

const email: string = rawEmail;

// ── Supabase client ──────────────────────────────────────────────────────────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The Supabase JS client's `auth.admin.*` helpers expect the legacy JWT
// service-role key; with the new `sb_secret_*` key format they fail to
// parse responses. Call the admin REST endpoints directly instead.
const authAdminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

type AuthUser = { id: string; email?: string; created_at?: string };

async function findAuthUserByEmail(targetEmail: string): Promise<AuthUser | null> {
  // Paginate through users until we find the match or exhaust the list.
  let page = 1;
  const perPage = 1000;
  while (true) {
    const res = await fetch(
      `${url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      { headers: authAdminHeaders }
    );
    if (!res.ok) {
      throw new Error(`listUsers HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { users: AuthUser[] };
    const match = body.users.find((u) => u.email?.toLowerCase() === targetEmail);
    if (match) return match;
    if (body.users.length < perPage) return null;
    page++;
  }
}

async function deleteAuthUser(userId: string): Promise<void> {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: authAdminHeaders,
  });
  if (!res.ok) {
    throw new Error(`deleteUser HTTP ${res.status}: ${await res.text()}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr() { console.log("─".repeat(60)); }

async function confirm(question: string): Promise<boolean> {
  if (skipConfirm) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

type Counts = Record<string, number>;

async function countMemberChildren(memberId: number): Promise<Counts> {
  const tables = [
    "belt_history",
    "check_ins",
    "waiver_signatures",
    "member_memberships",
    "member_purchases",
  ] as const;

  const results: Counts = {};
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);
    if (error) throw new Error(`count ${table}: ${error.message}`);
    results[table] = count ?? 0;
  }
  return results;
}

async function countByEmail(table: string, column: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, email);
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  hr();
  console.log(`  DELETE USER: ${email}`);
  if (dryRun) console.log("  MODE: dry-run (nothing will be deleted)");
  hr();

  // 1. Look up auth.users
  let authUser: AuthUser | null;
  try {
    authUser = await findAuthUserByEmail(email);
  } catch (e) {
    console.error(`Failed to list auth users: ${(e as Error).message}`);
    process.exit(1);
  }

  // 2. Look up members row
  const { data: memberRows, error: memberErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, user_id")
    .ilike("email", email);
  if (memberErr) {
    console.error(`Failed to query members: ${memberErr.message}`);
    process.exit(1);
  }
  const members = memberRows ?? [];

  // 3. Report what we found
  console.log("\n  FOUND:");
  if (authUser) {
    console.log(`    auth.users:   ${authUser.id}  (created ${authUser.created_at})`);
  } else {
    console.log("    auth.users:   (none)");
  }

  if (members.length === 0) {
    console.log("    members:      (none)");
  } else {
    for (const m of members) {
      console.log(`    members[${m.id}]: ${m.first_name} ${m.last_name}`);
      const children = await countMemberChildren(m.id);
      for (const [table, count] of Object.entries(children)) {
        if (count > 0) console.log(`      ${table}: ${count}`);
      }
    }
  }

  const archivedCount = await countByEmail("archived_waiver_signatures", "member_email");
  const subscriberCount = await countByEmail("subscribers", "value");
  const contactCount = await countByEmail("contact_submissions", "email");

  if (archivedCount > 0) console.log(`    archived_waiver_signatures: ${archivedCount}`);
  if (subscriberCount > 0) console.log(`    subscribers: ${subscriberCount}`);
  if (contactCount > 0) console.log(`    contact_submissions: ${contactCount}`);

  if (!authUser && members.length === 0 && archivedCount === 0 && subscriberCount === 0 && contactCount === 0) {
    console.log("\n  Nothing found for this email. Exiting.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\n  Dry run complete. Re-run without --dry-run to delete.");
    process.exit(0);
  }

  // 4. Confirm
  console.log("");
  hr();
  const ok = await confirm(`  Permanently delete ALL of the above? This CANNOT be undone. [y/N]`);
  if (!ok) {
    console.log("  Aborted.");
    process.exit(0);
  }
  hr();

  // 5. Delete in order
  console.log("\n  DELETING:");

  // Explicitly delete belt_history, check_ins, waiver_signatures, etc.
  // These all cascade from members, but we do them explicitly so the
  // output shows exactly what was removed (and to catch any RLS/permission
  // issue per-table instead of buried in the member delete).
  for (const m of members) {
    const tables = [
      "belt_history",
      "check_ins",
      "waiver_signatures",
      "member_memberships",
      "member_purchases",
    ] as const;
    for (const table of tables) {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: "exact" })
        .eq("member_id", m.id);
      if (error) {
        console.error(`    ${table}: FAILED — ${error.message}`);
        process.exit(1);
      }
      if ((count ?? 0) > 0) console.log(`    ${table}: ${count}`);
    }
  }

  // archived_waiver_signatures — keyed by email (denormalized)
  if (archivedCount > 0) {
    const { error, count } = await supabase
      .from("archived_waiver_signatures")
      .delete({ count: "exact" })
      .eq("member_email", email);
    if (error) {
      console.error(`    archived_waiver_signatures: FAILED — ${error.message}`);
      process.exit(1);
    }
    console.log(`    archived_waiver_signatures: ${count}`);
  }

  // members
  for (const m of members) {
    const { error } = await supabase.from("members").delete().eq("id", m.id);
    if (error) {
      console.error(`    members[${m.id}]: FAILED — ${error.message}`);
      process.exit(1);
    }
    console.log(`    members[${m.id}]: deleted`);
  }

  // auth.users (cascades profiles)
  if (authUser) {
    try {
      await deleteAuthUser(authUser.id);
      console.log(`    auth.users: deleted`);
    } catch (e) {
      console.error(`    auth.users: FAILED — ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // subscribers (newsletter/SMS) — value column holds the email
  if (subscriberCount > 0) {
    const { error, count } = await supabase
      .from("subscribers")
      .delete({ count: "exact" })
      .eq("value", email);
    if (error) {
      console.error(`    subscribers: FAILED — ${error.message}`);
      process.exit(1);
    }
    console.log(`    subscribers: ${count}`);
  }

  // contact_submissions
  if (contactCount > 0) {
    const { error, count } = await supabase
      .from("contact_submissions")
      .delete({ count: "exact" })
      .eq("email", email);
    if (error) {
      console.error(`    contact_submissions: FAILED — ${error.message}`);
      process.exit(1);
    }
    console.log(`    contact_submissions: ${count}`);
  }

  console.log("");
  hr();
  console.log("  ✓ Done. User has been fully removed.");
  console.log("  ⚠ If this user had a Stripe customer, delete it manually in the Stripe Dashboard.");
  hr();
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
