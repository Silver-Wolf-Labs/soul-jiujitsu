/**
 * Bootstrap canonical people — the gym's actual staff roster.
 *
 * Run (reads SUPABASE_SERVICE_ROLE_KEY + URL from .env.local):
 *   npx tsx --env-file=.env.local supabase/bootstrap_people.ts
 *
 * What it does, idempotently:
 *
 *   1. Upserts a `team` row per person with the right `type`
 *      (owner / head_coach / instructor / guest) and public-visibility
 *      defaults.
 *   2. Upserts an `instructors` row linked to that team row via
 *      `team_member_id`, preserving the stable instructors.id used by
 *      the existing check-ins snapshots.
 *   3. For the 5 full-staff coaches, also:
 *      a. Creates a Supabase auth user with a shared test password,
 *         skipping if the email is already registered.
 *      b. Marks the `profiles` row `is_admin = true`.
 *      c. Upserts a `members` row linked to `user_id` so the person
 *         shows up in kiosk / portal flows consistently.
 *      d. Upserts a single active `member_memberships` row.
 *   4. The visiting/seminar coach is team + instructor
 *      only, no auth, no member.
 *
 * Identity:
 *   • Canonical emails use the `@souljj.invalid` domain so they're
 *     clearly separable from the synthetic `@souljj.test` fixture users.
 *     Both TLDs are RFC-reserved and unresolvable, so no mail can ever be
 *     attempted against a bootstrapped account. The `unseed` path never
 *     touches these.
 *   • Password: `Testpass123!` (hardcoded; documented below). Safe for a
 *     test env, replace before prod.
 *
 * Repeatable: every upsert keys on a stable slug / email so re-running
 * the script is a no-op beyond refreshing any metadata.
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^"|"$/g, "");
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/^"|"$/g, "");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CANONICAL_PASSWORD = "Testpass123!";
// `.invalid` is reserved by RFC 2606 §2 — it can never be registered or
// resolve, so nothing can ever try to deliver to it. The previous value,
// `souljj.team`, was a real registrable TLD with no MX record: it looked
// like a live address, so a password reset or admin re-invite aimed at one
// of these accounts produced a hard bounce against the project's sending
// reputation. Any replacement must stay under a reserved TLD.
const CANONICAL_EMAIL_DOMAIN = "souljj.invalid";

// ─── Roster ─────────────────────────────────────────────────────────────────

type Belt = "white" | "blue" | "purple" | "brown" | "black";
type TeamType = "owner" | "head_coach" | "instructor" | "guest";

interface CanonicalPerson {
  firstName: string;
  lastName: string | null;
  /** free-text role displayed on the public /team page */
  role: string;
  type: TeamType;
  belt: Belt;
  bio: string;
  order: number;
  /** public /team visibility default — admins can override after bootstrap */
  publicVisible: boolean;
  /** when true, creates auth user + member + admin profile */
  fullAccount: boolean;
}

const ROSTER: CanonicalPerson[] = [
  {
    firstName: "Walter",
    lastName: "Davis",
    role: "Head Coach",
    type: "head_coach",
    belt: "black",
    bio: "Head coach at Soul JJ. Edit this bio in /admin/team.",
    order: 10,
    publicVisible: true,
    fullAccount: true,
  },
  {
    firstName: "Rob",
    lastName: "Ables",
    role: "BJJ Instructor",
    type: "instructor",
    belt: "black",
    bio: "Instructor at Soul JJ. Edit this bio in /admin/team.",
    order: 20,
    publicVisible: true,
    fullAccount: true,
  },
  {
    firstName: "Chelsah",
    lastName: "Lyons",
    role: "BJJ Instructor",
    type: "instructor",
    belt: "brown",
    bio: "Instructor at Soul JJ. Edit this bio in /admin/team.",
    order: 30,
    publicVisible: true,
    fullAccount: true,
  },
  {
    firstName: "McKayla",
    lastName: null,
    role: "BJJ Instructor",
    type: "instructor",
    belt: "purple",
    bio: "Instructor at Soul JJ. Edit this bio in /admin/team.",
    order: 40,
    publicVisible: true,
    fullAccount: true,
  },
  {
    firstName: "Richard",
    lastName: null,
    role: "BJJ Instructor",
    type: "instructor",
    belt: "black",
    bio: "Instructor at Soul JJ. Edit this bio in /admin/team.",
    order: 50,
    publicVisible: true,
    fullAccount: true,
  },
  {
    firstName: "Guest",
    lastName: "Instructor",
    role: "Visiting Coach — Seminar",
    type: "guest",
    belt: "black",
    bio: "Visiting coach for special seminars at Soul JJ.",
    order: 100,
    publicVisible: false, // guests opt in via admin UI
    fullAccount: false,
  },
];

// ─── Utilities ──────────────────────────────────────────────────────────────

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function displayName(p: CanonicalPerson): string {
  return p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName;
}

function emailFor(p: CanonicalPerson): string {
  const parts = [p.firstName, p.lastName].filter(Boolean).map(s => s!.toLowerCase());
  return `${parts.join(".")}@${CANONICAL_EMAIL_DOMAIN}`;
}

function log(section: string, msg: string): void {
  console.log(`[${section}] ${msg}`);
}

// ─── Steps ──────────────────────────────────────────────────────────────────

async function ensureMembershipPlanId(): Promise<number> {
  const { data: existing } = await db
    .from("membership_plans")
    .select("id")
    .eq("status", "active")
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id as number;
  const { data, error } = await db
    .from("membership_plans")
    .insert({ name: "Staff", description: "Placeholder plan for bootstrapped staff.", price_cents: 0, status: "active" })
    .select("id")
    .single();
  if (error) throw new Error(`plan insert: ${error.message}`);
  return data.id as number;
}

async function upsertTeamMember(p: CanonicalPerson): Promise<number> {
  const slug = slugify(displayName(p));
  const { data: existing } = await db
    .from("team")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const payload = {
    name: displayName(p),
    role: p.role,
    type: p.type,
    belt: p.belt,
    bio: p.bio,
    slug,
    order: p.order,
    active: true,
    visible_on_public_team: p.publicVisible,
  };

  if (existing?.id) {
    const { error } = await db.from("team").update(payload).eq("id", existing.id);
    if (error) throw new Error(`team update ${slug}: ${error.message}`);
    return existing.id as number;
  }
  const { data, error } = await db.from("team").insert(payload).select("id").single();
  if (error) throw new Error(`team insert ${slug}: ${error.message}`);
  return data.id as number;
}

async function upsertInstructor(p: CanonicalPerson, teamMemberId: number): Promise<number> {
  const slug = slugify(displayName(p));
  const name = displayName(p);

  const { data: existing } = await db
    .from("instructors")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const payload = { name, slug, active: true, team_member_id: teamMemberId };

  if (existing?.id) {
    const { error } = await db.from("instructors").update(payload).eq("id", existing.id);
    if (error) throw new Error(`instructor update ${slug}: ${error.message}`);
    return existing.id as number;
  }
  const { data, error } = await db.from("instructors").insert(payload).select("id").single();
  if (error) throw new Error(`instructor insert ${slug}: ${error.message}`);
  return data.id as number;
}

/** Returns the auth user's UUID (existing or freshly created). */
async function ensureAuthUser(p: CanonicalPerson): Promise<string> {
  const email = emailFor(p);
  // The `listUsers` admin endpoint is paginated (no email filter in this
  // version), so we search the first page. For a roster of 5 that's
  // plenty. Scale via `.getUserByEmail` once it's universally available.
  const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  const { data, error } = await db.auth.admin.createUser({
    email,
    password: CANONICAL_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: p.firstName,
      last_name: p.lastName ?? "",
      full_name: displayName(p),
    },
  });
  if (error || !data?.user) {
    throw new Error(`auth user create ${email}: ${error?.message ?? "unknown"}`);
  }
  return data.user.id;
}

async function upsertProfileAdmin(userId: string, p: CanonicalPerson): Promise<void> {
  // The `handle_new_user` trigger typically creates the profile row when the
  // auth user is minted. We upsert so this script remains idempotent even
  // if the trigger didn't run (e.g. manually-created users).
  const payload = {
    id: userId,
    is_admin: true,
    full_name: displayName(p),
    email: emailFor(p),
    role: "admin",
  };
  const { error } = await db.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) throw new Error(`profile upsert ${displayName(p)}: ${error.message}`);
}

async function upsertMember(userId: string, p: CanonicalPerson, planId: number): Promise<number> {
  const email = emailFor(p);
  const { data: existing } = await db
    .from("members")
    .select("id, user_id")
    .eq("email", email)
    .maybeSingle();

  const payload = {
    user_id: userId,
    first_name: p.firstName,
    last_name: p.lastName ?? "",
    email,
    status: "active" as const,
    communication_opt_in: true,
    waiver_signed_at: new Date().toISOString(),
  };

  let memberId: number;
  if (existing?.id) {
    const { error } = await db.from("members").update(payload).eq("id", existing.id);
    if (error) throw new Error(`member update ${email}: ${error.message}`);
    memberId = existing.id as number;
  } else {
    const { data, error } = await db.from("members").insert(payload).select("id").single();
    if (error) throw new Error(`member insert ${email}: ${error.message}`);
    memberId = data.id as number;
  }

  // One canonical active membership — upsert keyed on member_id.
  const { data: existingMem } = await db
    .from("member_memberships")
    .select("id")
    .eq("member_id", memberId)
    .maybeSingle();
  if (!existingMem) {
    const { error } = await db.from("member_memberships").insert({
      member_id: memberId,
      plan_id: planId,
      status: "active",
      locked_price_cents: 0,
    });
    if (error) throw new Error(`membership insert ${email}: ${error.message}`);
  }
  return memberId;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  log("bootstrap", `Seeding ${ROSTER.length} canonical people…`);

  const planId = await ensureMembershipPlanId();

  for (const person of ROSTER) {
    const teamId = await upsertTeamMember(person);
    const instructorId = await upsertInstructor(person, teamId);
    if (person.fullAccount) {
      const userId = await ensureAuthUser(person);
      await upsertProfileAdmin(userId, person);
      await upsertMember(userId, person, planId);
      log(
        "person",
        `✓ ${displayName(person)} · team=${teamId} instructor=${instructorId} auth=${userId.slice(0, 8)}…`,
      );
    } else {
      log(
        "person",
        `✓ ${displayName(person)} · team=${teamId} instructor=${instructorId} (external — no auth/member)`,
      );
    }
  }

  log("done", `Complete in ${Math.round((Date.now() - started) / 1000)}s.`);
  log("login", `All bootstrapped accounts share the password "${CANONICAL_PASSWORD}".`);
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
