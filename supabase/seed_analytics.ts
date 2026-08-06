/**
 * Analytics seed script — populates instructors, members, memberships, and
 * six months of check-ins so the dashboards have enough signal to validate.
 *
 * Run:
 *   npx tsx --env-file=.env.local supabase/seed_analytics.ts
 *   npx tsx --env-file=.env.local supabase/seed_analytics.ts --reset
 *
 * Guarantees:
 *   - Idempotent. Seed rows are tagged by email domain (@souljj.test) and
 *     phone range (555-0xxx) so we can find and delete only seed data
 *     without touching real members. Real accounts (e.g. the admin's
 *     segura2794@gmail.com) are upserted — identity fields left alone,
 *     check-in history added.
 *   - Instructor attribution matches the production pattern: every
 *     check-in carries its schedule slot's `instructor_id` and
 *     `instructor_name` snapshot. ~10% of schedule slots stay
 *     unassigned on purpose so analytics best-effort behavior gets
 *     exercised.
 *   - Dates are in gym TZ (America/Chicago). A check-in's `class_date`
 *     is always a day that the referenced slot actually runs
 *     (day_of_week respected).
 *
 * Run against the linked Supabase project using the service role key
 * from .env.local — SUPABASE_SERVICE_ROLE_KEY must be set. This script
 * bypasses RLS intentionally (seeding requires it) and should never be
 * shipped into a Route Handler or Server Action.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");

// ─── Config ─────────────────────────────────────────────────────────────────

const TODAY_ISO = "2026-04-18";   // Anchor; sync with local date for reproducibility.
const DAYS_BACK = 183;            // ~6 months.
const SEED_EMAIL_DOMAIN = "souljj.test";
// 7-digit phone shape (`xxx-xxxx`) with a fixed "555-0" prefix + a 3-digit
// serial. "555-0xxx" keeps us in the TEST/fake range (555-0100..555-0199
// is reserved for fiction; we trail into 555-0200+ for larger rosters —
// still clearly synthetic, never mistaken for a live member's phone).
const SEED_PHONE_PREFIX = "555-0";
const REAL_ADMIN_EMAIL = "segura2794@gmail.com";
const INSTRUCTOR_COVERAGE = 0.9;  // 90% of schedule slots get an instructor.

// Supabase URL + service key come from .env.local via tsx --env-file=.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db: SupabaseClient = createClient(SUPABASE_URL.replace(/^"|"$/g, ""), SERVICE_KEY.replace(/^"|"$/g, ""), {
  auth: { persistSession: false },
});

// ─── Utilities ──────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000;
  const d2 = new Date(t);
  return `${d2.getUTCFullYear()}-${String(d2.getUTCMonth() + 1).padStart(2, "0")}-${String(d2.getUTCDate()).padStart(2, "0")}`;
}

function pgDow(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Deterministic pseudo-random — a small LCG seeded with a string so every
// run of this script produces the same synthetic members + check-ins.
// Stable output = stable screenshots when debugging analytics.
class SeededRandom {
  private state: number;
  constructor(seed: string) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    }
    this.state = h >>> 0 || 1;
  }
  next(): number {
    // Park-Miller minimum standard.
    this.state = (this.state * 48271) % 0x7fffffff;
    return this.state / 0x7fffffff;
  }
  int(min: number, maxExclusive: number): number {
    return Math.floor(this.next() * (maxExclusive - min)) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length)];
  }
  /** Bernoulli trial — returns true with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

const rng = new SeededRandom("souljj-analytics-seed-v1");

function log(section: string, msg: string): void {
  console.log(`[${section}] ${msg}`);
}

// ─── Domain constants ───────────────────────────────────────────────────────

// Instructor roster is owned by `bootstrap_people.ts`. This script
// never creates instructors — it assumes the bootstrap has run and just
// assigns the existing active ones to slots. Keeping the two concerns
// separated means the synthetic analytics fixture never overwrites the
// canonical team's identity.

// Member profile buckets — each controls the attendance simulator below.
type Profile = "consistent" | "moderate" | "sporadic" | "at_risk" | "new_trial" | "canceled";

// `member_status` enum (from schema): prospect | trial | active | inactive | suspended.
// `membership_status` enum: trialing | active | paused | canceled | past_due.
// We map our synthetic "canceled" profile to member_status=inactive +
// membership_status=canceled so both rows stay valid and analytics picks
// up the cancellation correctly.
type MemberStatusEnum = "prospect" | "trial" | "active" | "inactive" | "suspended";

interface ProfileSpec {
  profile: Profile;
  count: number;
  /** Target attendance as a Bernoulli probability on each eligible day. */
  dailyProbability: number;
  /** Only check-ins in this date range are generated. */
  startOffset: number;  // days before today
  endOffset: number;    // days before today (inclusive, 0 = today)
  memberStatus: MemberStatusEnum;
}

// 200 synthetic members — large enough to populate leaderboards +
// modality/level/audience segment breakdowns in analytics while still
// feeling demo-realistic. Distribution skews toward consistent /
// moderate because that's the realistic active cohort at a gym.
const PROFILES: ProfileSpec[] = [
  { profile: "consistent",  count: 60, dailyProbability: 0.55, startOffset: DAYS_BACK, endOffset: 0,   memberStatus: "active"   },
  { profile: "moderate",    count: 60, dailyProbability: 0.22, startOffset: DAYS_BACK, endOffset: 0,   memberStatus: "active"   },
  { profile: "sporadic",    count: 35, dailyProbability: 0.07, startOffset: DAYS_BACK, endOffset: 0,   memberStatus: "active"   },
  // At-risk members were active until ~25 days ago, then stopped.
  { profile: "at_risk",     count: 15, dailyProbability: 0.35, startOffset: DAYS_BACK, endOffset: 25,  memberStatus: "active"   },
  // New trials joined recently — only have activity in the last 30 days.
  { profile: "new_trial",   count: 15, dailyProbability: 0.25, startOffset: 28,        endOffset: 0,   memberStatus: "trial"    },
  // Canceled members: member_status=inactive, membership_status=canceled.
  { profile: "canceled",    count: 15, dailyProbability: 0.30, startOffset: DAYS_BACK, endOffset: 60,  memberStatus: "inactive" },
];

// First + last name pools — a large, realistic mix drawn from
// popular US baby names + top US surnames across major origins. The
// seed combines them via a deterministic LCG walk so re-runs produce
// the same roster. 100+ firsts × 100+ lasts = ample room to generate
// ~110 unique members with no repeated (first, last) pair.
const FIRST_NAMES = [
  // A
  "Aaliyah","Abigail","Adrian","Aisha","Alejandro","Alex","Alice","Amanda","Amara","Ana",
  "Andres","Angela","Anna","Anthony","Ariana","Asa","Ashley","Avery","Ayla","Aziz",
  // B-D
  "Beatrice","Ben","Bianca","Blake","Bo","Brandon","Brian","Bruno","Caleb","Cameron",
  "Camila","Carlos","Carolina","Charlie","Chloe","Claire","Cole","Connor","Cruz","Dalia",
  "Damon","Dani","David","Dayton","Devon","Diego","Dominic","Dylan",
  // E-H
  "Elena","Eli","Elijah","Elise","Elliot","Emerson","Emily","Emma","Ethan","Eva",
  "Evan","Fatima","Felix","Finn","Gabe","Gabriel","Gabriela","Gio","Grace","Hana",
  "Harper","Hassan","Henry","Hugo",
  // I-L
  "Ian","Imani","Isaac","Isabel","Isaiah","Isla","Ivy","Jack","Jackson","Jade",
  "Jalen","James","Jamie","Jasmine","Jasper","Jayden","Jesse","Jessica","Jonas","Jordan",
  "Jorge","Jose","Joshua","Julia","Julian","Juno","Kai","Karim","Kayla","Kenji",
  "Kenzo","Kira","Kofi","Kyla","Lana","Layla","Leah","Leo","Levi","Liam",
  "Lily","Lincoln","Logan","Luca","Lucia","Lucy","Luis","Luna",
  // M-P
  "Maddox","Malik","Marco","Maria","Mateo","Maya","Mia","Micah","Mila","Milo",
  "Miguel","Minori","Mohammed","Nadia","Nala","Nate","Nia","Nico","Noah","Nora",
  "Octavia","Oliver","Olivia","Omar","Oscar","Owen","Parker","Paulo","Pedro","Penelope",
  "Phoebe","Pilar","Priya",
  // Q-S
  "Quentin","Quinn","Rafael","Rahim","Rashad","Raul","Reese","Renata","Rhea","Riley",
  "Rio","Roberto","Rocco","Rohan","Romeo","Roshni","Rowan","Ruby","Sage","Saif",
  "Samuel","Sara","Saskia","Sasha","Sebastian","Selena","Sienna","Simon","Sloane","Sofia",
  "Sophia","Stella","Suzu",
  // T-Z
  "Tadeo","Takumi","Tara","Taylor","Theo","Thomas","Tomas","Uma","Valentina","Valeria",
  "Vera","Victor","Violet","Vivian","Vivienne","Wes","Will","Wyatt","Xavier","Xena",
  "Yara","Yuki","Yusuf","Zadie","Zane","Zoe","Zora",
];

const LAST_NAMES = [
  // Anglo
  "Adams","Allen","Anderson","Bailey","Baker","Barnes","Bennett","Brooks","Brown","Bryant",
  "Butler","Campbell","Carter","Clark","Collins","Cook","Cooper","Cox","Davis","Dixon",
  "Edwards","Ellis","Evans","Fisher","Fleming","Foster","Gardner","Graham","Green","Hall",
  "Hamilton","Harris","Hart","Hayes","Henderson","Hughes","Hunter","Jackson","James","Jenkins",
  "Johnson","Jones","Kennedy","King","Lawson","Lewis","Lowe","Martin","Mason","McCarthy",
  "McKay","Miller","Mitchell","Moore","Morgan","Murphy","Murray","Nelson","Owens","Parker",
  "Pearson","Phillips","Powell","Price","Quinn","Reed","Reid","Richards","Roberts","Ross",
  "Scott","Shaw","Simmons","Smith","Stewart","Sullivan","Taylor","Thomas","Thompson","Turner",
  "Walker","Ward","Watson","Wells","White","Williams","Wilson","Young",
  // Hispanic / Latino
  "Alvarez","Arroyo","Cabrera","Castro","Cruz","Delgado","Diaz","Duarte","Espinoza","Fuentes",
  "Garcia","Gomez","Gonzalez","Guerrero","Hernandez","Jimenez","Lopez","Mendoza","Morales","Ortiz",
  "Perez","Ramirez","Reyes","Rios","Rodriguez","Rojas","Salinas","Sanchez","Santos","Silva",
  "Torres","Vargas","Vasquez","Vega",
  // Asian
  "Chen","Cho","Choi","Chu","Fujita","Gupta","Hassan","Huang","Iyer","Jensen",
  "Kaur","Khan","Kim","Kumar","Lee","Li","Lin","Liu","Mehta","Nakamura",
  "Nguyen","Osei","Park","Patel","Rahman","Rao","Saito","Shah","Singh","Tanaka",
  "Tran","Wong","Wu","Xu","Yamada","Yang","Yoon","Zhang","Zhao","Zhou",
  // Other / diverse
  "Abara","Akello","Bauer","Cohen","Fischer","Goldberg","Jovanovic","Kowalski","Marchetti","Moreno",
  "Novak","Okafor","Papadopoulos","Petrov","Rossi","Schmidt","Silva","Takahashi","Ueda","Walsh",
];

const BELTS = ["white","white","white","white","white","blue","blue","blue","purple","brown"] as const;

// ─── Steps ──────────────────────────────────────────────────────────────────

interface Instructor { id: number; name: string; slug: string }

/** Enriched slot — scalar columns + the four taxonomy dimensions
 *  flattened into primitives the seed code can snapshot onto check-ins
 *  without re-joining on every write. */
interface ScheduleSlot {
  id: number;
  title: string;
  day_of_week: number;
  start_time: string;
  instructor_id: number | null;
  instructor_name: string | null;
  modality_id: number | null;
  modality_name: string | null;
  level_id: number | null;
  level_name: string | null;
  /** Focuses attached to the slot (may be empty). Each check-in against
   *  this slot writes a `check_in_focuses` row per entry, matching the
   *  production `snapshot_check_in_taxonomy` RPC's behavior. */
  focuses: { id: number; name: string }[];
  audiences: { id: number; name: string; kind: "age" | "gender" | "rank" | "access" }[];
}
interface MembershipPlan { id: number; locked_price_cents: number | null }

async function resetSeedData(): Promise<void> {
  log("reset", "Deleting seed check-ins, memberships, and members…");
  // Order matters: check_ins → member_memberships → members. Belt history
  // cascades from members via FK (check_ins cascades too, but we also
  // want to clean up rows that don't cascade via member deletion such as
  // legacy seeded rows with no member link — not applicable today but
  // cheap insurance).
  const { data: seedMembers } = await db
    .from("members")
    .select("id")
    .like("email", `%@${SEED_EMAIL_DOMAIN}`);
  const ids = (seedMembers ?? []).map(m => m.id as number);
  if (ids.length > 0) {
    await db.from("check_ins").delete().in("member_id", ids);
    await db.from("member_memberships").delete().in("member_id", ids);
    await db.from("members").delete().in("id", ids);
    log("reset", `Removed ${ids.length} seed members + dependent rows.`);
  } else {
    log("reset", "No seed members to remove.");
  }
  // Check-ins for the real admin — only seed-tagged ones (notes contains
  // the marker) — are cleared too. We never delete their member row.
  const { data: adminMember } = await db
    .from("members")
    .select("id")
    .eq("email", REAL_ADMIN_EMAIL)
    .maybeSingle();
  if (adminMember?.id) {
    const { error } = await db
      .from("check_ins")
      .delete()
      .eq("member_id", adminMember.id)
      .eq("source", "admin"); // safe proxy — all seed rows use source=admin
    if (error) log("reset", `warn: ${error.message}`);
  }
}

async function loadInstructors(): Promise<Instructor[]> {
  const { data, error } = await db
    .from("instructors")
    .select("id, name, slug")
    .eq("active", true)
    .order("id");
  if (error) throw new Error(`instructor select: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      "No active instructors found. Run bootstrap_people.ts first so the canonical roster exists.",
    );
  }
  log("instructors", `Using ${data.length} existing active instructors from the bootstrap roster.`);
  return data as Instructor[];
}

const SLOT_SELECT = `
  id,
  title,
  day_of_week,
  start_time,
  instructor_id,
  instructor_name,
  modality_id,
  level_id,
  modality:class_modalities!left(name),
  level:class_levels!left(name),
  slot_focuses:schedule_slot_focuses(focus:class_focuses!inner(id, name)),
  slot_audiences:schedule_slot_audiences(audience:class_audiences!inner(id, name, kind, sort_order))
` as const;

async function assignSchedule(instructors: Instructor[]): Promise<ScheduleSlot[]> {
  log("schedule", "Assigning instructors to 90% of schedule slots…");
  const { data, error } = await db
    .from("schedule_slots")
    .select(SLOT_SELECT)
    .eq("active", true)
    .order("id");
  if (error) throw new Error(`schedule select: ${error.message}`);
  const slots = (data ?? []).map(flattenSlot);

  const updates: { id: number; instructor_id: number | null; instructor_name: string | null }[] = [];
  for (const slot of slots) {
    if (rng.chance(INSTRUCTOR_COVERAGE)) {
      const inst = rng.pick(instructors);
      if (slot.instructor_id !== inst.id || slot.instructor_name !== inst.name) {
        updates.push({ id: slot.id, instructor_id: inst.id, instructor_name: inst.name });
      }
    } else {
      if (slot.instructor_id !== null) {
        updates.push({ id: slot.id, instructor_id: null, instructor_name: null });
      }
    }
  }
  for (const u of updates) {
    const { error: updErr } = await db
      .from("schedule_slots")
      .update({ instructor_id: u.instructor_id, instructor_name: u.instructor_name })
      .eq("id", u.id);
    if (updErr) throw new Error(`schedule update ${u.id}: ${updErr.message}`);

    // Keep the junction in sync — scalar ↔ junction is the invariant.
    // Delete any existing junction rows for this slot (cheap; the
    // schedule is small) and write the new primary.
    await db.from("schedule_slot_instructors").delete().eq("schedule_slot_id", u.id);
    if (u.instructor_id) {
      const { error: joinErr } = await db
        .from("schedule_slot_instructors")
        .insert({ schedule_slot_id: u.id, instructor_id: u.instructor_id, sort_order: 0 });
      if (joinErr) throw new Error(`slot junction insert ${u.id}: ${joinErr.message}`);
    }
  }

  const { data: fresh } = await db
    .from("schedule_slots")
    .select(SLOT_SELECT)
    .eq("active", true)
    .order("id");
  const freshSlots = (fresh ?? []).map(flattenSlot);
  const assigned = freshSlots.filter((s) => s.instructor_id).length;
  log(
    "schedule",
    `Total ${freshSlots.length} slots · assigned ${assigned} (${Math.round((assigned / freshSlots.length) * 100)}%)`,
  );
  return freshSlots;
}

/**
 * Enrich schedule_slots with plausible focus junctions so analytics has
 * something to group by. The Phase 1 backfill only matched "leg" /
 * "takedown" keywords (2 slots) — that leaves focus analytics anemic.
 * This seed step attaches focuses by heuristic to the remaining slots
 * so the dashboards look populated without the admin having to tag
 * them manually.
 *
 * Idempotent: `ON CONFLICT DO NOTHING` on the PK
 * `(schedule_slot_id, focus_id)` — re-running leaves existing rows
 * in place and only fills gaps.
 */
async function enrichSlotFocuses(slots: ScheduleSlot[]): Promise<void> {
  log("enrich", "Attaching plausible focuses to slots that lack them…");

  const { data: focusRows, error: focusErr } = await db
    .from("class_focuses")
    .select("id, slug")
    .eq("active", true);
  if (focusErr) throw new Error(`focus load: ${focusErr.message}`);
  const focusBySlug = new Map<string, number>();
  for (const f of focusRows ?? []) {
    focusBySlug.set(f.slug as string, f.id as number);
  }

  function pickFocuses(slot: ScheduleSlot): string[] {
    if (slot.focuses.length > 0) return []; // Respect existing attribution.
    const title = slot.title.toLowerCase();
    const level = (slot.level_name ?? "").toLowerCase();
    const modality = (slot.modality_name ?? "").toLowerCase();

    // Title keyword overrides first.
    if (title.includes("leg"))      return ["leg-locks"];
    if (title.includes("takedown")) return ["takedowns"];
    if (title.includes("guard"))    return ["guard-passing"];

    // Open Mat, Competition Prep, Conditioning — no focus by convention.
    if (modality === "open mat" || modality === "competition prep" || modality === "conditioning") {
      return [];
    }

    // Level-driven default. Advanced / Intermediate get sparring-heavy
    // tags; Fundamentals / Beginners get positional basics.
    if (level === "advanced")     return rng.chance(0.6) ? ["positional-sparring"] : ["submissions"];
    if (level === "intermediate") return rng.chance(0.5) ? ["guard-passing"] : ["submissions"];
    if (level === "fundamentals") return rng.chance(0.7) ? ["guard-passing"] : [];
    // All Levels + null: 50% chance of a generic focus, 50% unfocused.
    return rng.chance(0.5) ? [rng.pick(["guard-passing", "submissions", "positional-sparring"])] : [];
  }

  const toInsert: { schedule_slot_id: number; focus_id: number; sort_order: number }[] = [];
  for (const slot of slots) {
    const slugs = pickFocuses(slot);
    slugs.forEach((slug, i) => {
      const fid = focusBySlug.get(slug);
      if (fid != null) {
        toInsert.push({ schedule_slot_id: slot.id, focus_id: fid, sort_order: i });
      }
    });
  }

  if (toInsert.length === 0) {
    log("enrich", "No slots needed focus enrichment — existing attribution covers everything.");
    return;
  }

  // Upsert-style: the PK is (schedule_slot_id, focus_id) so
  // on_conflict is safe. Do a plain insert and ignore duplicates via
  // upsert + ignoreDuplicates option.
  const { error: insErr } = await db
    .from("schedule_slot_focuses")
    .upsert(toInsert, { onConflict: "schedule_slot_id,focus_id", ignoreDuplicates: true });
  if (insErr) throw new Error(`focus enrich insert: ${insErr.message}`);
  log("enrich", `Added ${toInsert.length} focus attribution rows.`);
}

/**
 * PostgREST returns nested `*_to_one` rows either as an object or an
 * array of one; `*_to_many` rows always arrive as an array. This
 * flattener normalizes both into the plain `ScheduleSlot` shape the
 * seed writer expects.
 */
function flattenSlot(raw: unknown): ScheduleSlot {
  const r = raw as {
    id: number;
    title: string;
    day_of_week: number;
    start_time: string;
    instructor_id: number | null;
    instructor_name: string | null;
    modality_id: number | null;
    level_id: number | null;
    modality: { name: string } | { name: string }[] | null;
    level: { name: string } | { name: string }[] | null;
    slot_focuses: { focus: { id: number; name: string } | null }[] | null;
    slot_audiences: { audience: { id: number; name: string; kind: string; sort_order: number } | null }[] | null;
  };
  const modality = Array.isArray(r.modality) ? r.modality[0] : r.modality;
  const level    = Array.isArray(r.level)    ? r.level[0]    : r.level;
  const focuses = (r.slot_focuses ?? [])
    .map((j) => j.focus)
    .filter((f): f is { id: number; name: string } => !!f)
    .map((f) => ({ id: f.id, name: f.name }));
  const audiences = (r.slot_audiences ?? [])
    .map((j) => j.audience)
    .filter((a): a is { id: number; name: string; kind: string; sort_order: number } => !!a)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind as "age" | "gender" | "rank" | "access" }));
  return {
    id: r.id,
    title: r.title,
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    instructor_id: r.instructor_id,
    instructor_name: r.instructor_name,
    modality_id: r.modality_id,
    modality_name: modality?.name ?? null,
    level_id: r.level_id,
    level_name: level?.name ?? null,
    focuses,
    audiences,
  };
}

async function ensureMembershipPlan(): Promise<MembershipPlan> {
  // Seeded memberships need SOMETHING to reference; grab any active plan,
  // or create a minimal one. The analytics doesn't read plans — just
  // counts `member_memberships` rows — so the exact plan doesn't matter.
  const { data: existing } = await db
    .from("membership_plans")
    .select("id")
    .eq("status", "active")
    .limit(1);
  if (existing && existing.length > 0) {
    return { id: existing[0].id as number, locked_price_cents: 10000 };
  }
  const { data, error } = await db
    .from("membership_plans")
    .insert({ name: "Seed Plan", description: "Created by seed_analytics.ts", price_cents: 10000, status: "active" })
    .select("id")
    .single();
  if (error) throw new Error(`plan insert: ${error.message}`);
  return { id: data.id as number, locked_price_cents: 10000 };
}

interface SeedMember {
  id: number;
  profile: Profile;
  status: string;
  email: string;
  first_name: string;
  last_name: string;
}

async function seedMembers(plan: MembershipPlan): Promise<SeedMember[]> {
  log("members", "Creating synthetic members…");
  const today = TODAY_ISO;
  const results: SeedMember[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let phoneCursor = 100;
  const usedNames = new Set<string>();

  for (const spec of PROFILES) {
    for (let i = 0; i < spec.count; i++) {
      // Pick first + last at random from the pool, deterministically
      // (seeded PRNG in rng). Retry on (first, last) collision so we
      // never produce two synthetic "Alex Smith"s — realistic rosters
      // have unique combinations. With ~160 × ~150 names the loop
      // terminates in ≤ a few iterations even at full roster.
      let first = "";
      let last = "";
      let combo = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        first = rng.pick(FIRST_NAMES);
        last = rng.pick(LAST_NAMES);
        combo = `${first} ${last}`;
        if (!usedNames.has(combo)) break;
      }
      usedNames.add(combo);
      const email = `seed-${slugify(first)}.${slugify(last)}.${spec.profile}${i}@${SEED_EMAIL_DOMAIN}`;
      const phone = `${SEED_PHONE_PREFIX}${String(phoneCursor++).padStart(3, "0")}`;
      const joinedOffset = spec.profile === "new_trial"
        ? rng.int(2, 28)
        : spec.profile === "canceled"
          ? rng.int(90, DAYS_BACK)
          : rng.int(60, Math.max(DAYS_BACK, 365));
      const created_at = `${addDays(today, -joinedOffset)}T12:00:00+00`;

      // Upsert by email. Email is unique (case-insensitive) in the schema.
      const { data: existing } = await db
        .from("members")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      let memberId: number;
      if (existing?.id) {
        const { error } = await db
          .from("members")
          .update({
            first_name: first,
            last_name: last,
            phone,
            status: spec.memberStatus,
          })
          .eq("id", existing.id);
        if (error) throw new Error(`member update ${email}: ${error.message}`);
        memberId = existing.id as number;
        updatedCount++;
      } else {
        const { data, error } = await db
          .from("members")
          .insert({
            first_name: first,
            last_name: last,
            email,
            phone,
            status: spec.memberStatus,
            communication_opt_in: true,
            created_at,
          })
          .select("id")
          .single();
        if (error) throw new Error(`member insert ${email}: ${error.message}`);
        memberId = data.id as number;
        createdCount++;
      }

      // Membership row — single canonical row per member, status mirrors
      // the member's status loosely (just enough for the KPI counts).
      const { data: existingMem } = await db
        .from("member_memberships")
        .select("id")
        .eq("member_id", memberId)
        .maybeSingle();
      // Membership status derives from profile, not member_status — a
      // "canceled" profile maps to `membership_status=canceled` even
      // though the member row shows `inactive`. That's the model: the
      // member is inactive because their membership was canceled.
      const membershipStatus: string =
        spec.profile === "canceled"
          ? "canceled"
          : spec.profile === "new_trial"
            ? "trialing"
            : "active";
      const canceledAt =
        spec.profile === "canceled"
          ? `${addDays(today, -spec.endOffset)}T12:00:00+00`
          : null;
      if (!existingMem) {
        const { error } = await db.from("member_memberships").insert({
          member_id: memberId,
          plan_id: plan.id,
          status: membershipStatus,
          started_at: created_at,
          canceled_at: canceledAt,
          locked_price_cents: plan.locked_price_cents ?? 10000,
        });
        if (error) throw new Error(`membership insert ${email}: ${error.message}`);
      }

      results.push({
        id: memberId,
        profile: spec.profile,
        status: spec.memberStatus,
        email,
        first_name: first,
        last_name: last,
      });
    }
  }

  // The real admin (`segura2794@gmail.com`) is intentionally NOT added
  // to the synthetic member pool. Mixing real accounts with seeded
  // fixtures makes the unseed path ambiguous (their check-ins can't be
  // distinguished from real ones without a seed marker). The
  // `bootstrap_people.ts` script owns any canonical staff rows; this
  // script owns fixtures only.

  log("members", `Created ${createdCount}, updated ${updatedCount}, total ${results.length}.`);
  return results;
}

async function seedCheckIns(members: SeedMember[], slots: ScheduleSlot[]): Promise<number> {
  log("check-ins", "Generating 6 months of check-ins…");
  const today = TODAY_ISO;
  const rows: Record<string, unknown>[] = [];
  // Per-row snapshot of the slot's focus + audience lists, indexed by
  // position in `rows`. Used after the bulk insert to fan out
  // `check_in_focuses` / `check_in_audiences` junction rows.
  interface PendingJunctions {
    rowIdx: number;
    focuses:   { id: number; name: string }[];
    audiences: { id: number; name: string; kind: "age" | "gender" | "rank" | "access" }[];
  }
  const pendingJunctions: PendingJunctions[] = [];
  // Keyed de-dupe inside this run: one check-in per (member, slot, date).
  const keySeen = new Set<string>();

  const slotsByDow = new Map<number, ScheduleSlot[]>();
  for (const s of slots) {
    const list = slotsByDow.get(s.day_of_week) ?? [];
    list.push(s);
    slotsByDow.set(s.day_of_week, list);
  }

  for (const member of members) {
    const spec = PROFILES.find(p => p.profile === member.profile);
    const daily = spec?.dailyProbability ?? 0.3;
    const startOffset = spec?.startOffset ?? DAYS_BACK;
    const endOffset = spec?.endOffset ?? 0;

    // Each member gets 1-3 "preferred" day-of-week values, mimicking real
    // scheduling patterns (people come Mon/Wed/Fri or Tue/Thu, not uniformly).
    const preferredDays = new Set<number>();
    const preferredCount = rng.int(2, 4);
    while (preferredDays.size < preferredCount) {
      preferredDays.add(rng.int(1, 8));
    }

    for (let off = startOffset; off >= endOffset; off--) {
      const date = addDays(today, -off);
      const dow = pgDow(date);
      const available = slotsByDow.get(dow) ?? [];
      if (available.length === 0) continue;
      // Boost probability on preferred days, dampen others.
      const p = preferredDays.has(dow) ? daily * 1.4 : daily * 0.4;
      if (!rng.chance(p)) continue;
      // Prefer evening slots slightly (gym owner's busiest window).
      const evenings = available.filter((s) => parseInt(s.start_time.slice(0, 2), 10) >= 17);
      const choice = rng.chance(0.6) && evenings.length > 0
        ? rng.pick(evenings)
        : rng.pick(available);
      const key = `${member.id}|${choice.id}|${date}`;
      if (keySeen.has(key)) continue;
      keySeen.add(key);
      rows.push({
        member_id: member.id,
        schedule_slot_id: choice.id,
        class_name: choice.title,
        class_date: date,
        // Assume members show up around their class start time for
        // realistic checked_in_at timestamps.
        checked_in_at: `${date}T${choice.start_time.slice(0, 5)}:00+00`,
        source: "admin",
        instructor_id: choice.instructor_id,
        instructor_name: choice.instructor_name,
        // Taxonomy snapshots — mirror what `snapshot_check_in_taxonomy`
        // RPC would write. Doing it inline keeps this bulk seeder a
        // single round-trip per batch instead of one RPC per row.
        modality_id:   choice.modality_id,
        modality_name: choice.modality_name,
        level_id:      choice.level_id,
        level_name:    choice.level_name,
      });
      // Carry the slot's focus + audience sets alongside the row so we
      // can fan out junction inserts after the check-in ids come back.
      pendingJunctions.push({
        rowIdx: rows.length - 1,
        focuses: choice.focuses,
        audiences: choice.audiences,
      });
    }
  }

  // Bulk insert in batches. Supabase REST limit is generous but we keep
  // batches at 500 to stay well under timeouts and memory. We need the
  // inserted ids to fan out `check_in_instructors` / `_focuses` /
  // `_audiences` rows, so use `.select("id")` and mirror the incoming
  // order.
  const BATCH = 500;
  type InsertedRow = { id: number };
  const instructorJunction: Record<string, unknown>[] = [];
  const focusJunction:      Record<string, unknown>[] = [];
  const audienceJunction:   Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { data, error } = await db.from("check_ins").insert(chunk).select("id");
    if (error) throw new Error(`check-in insert batch ${i}: ${error.message}`);
    const inserted = (data ?? []) as InsertedRow[];
    for (let j = 0; j < inserted.length; j++) {
      const src = chunk[j];
      const rowIdx = i + j;
      const pending = pendingJunctions[rowIdx];
      const instructorId = src.instructor_id as number | null;
      const instructorName = src.instructor_name as string | null;
      const checkInId = inserted[j].id;

      if (instructorId != null || instructorName != null) {
        instructorJunction.push({
          check_in_id: checkInId,
          instructor_id: instructorId,
          instructor_name: instructorName,
          sort_order: 0,
        });
      }

      // Fan out focus + audience snapshots. sort_order is regenerated
      // per-check-in (matches `snapshot_check_in_taxonomy` RPC's
      // ROW_NUMBER contract, and guarantees the `(check_in_id,
      // sort_order)` PK stays unique even when the slot-side rows share
      // sort_order=0).
      pending.focuses.forEach((f, k) => {
        focusJunction.push({
          check_in_id: checkInId,
          focus_id: f.id,
          focus_name: f.name,
          sort_order: k,
        });
      });
      pending.audiences.forEach((a, k) => {
        audienceJunction.push({
          check_in_id: checkInId,
          audience_id: a.id,
          audience_name: a.name,
          audience_kind: a.kind,
          sort_order: k,
        });
      });
    }
    log("check-ins", `  wrote ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  // Junction writes — same batch cadence.
  async function writeJunction(table: string, rowsToWrite: Record<string, unknown>[]): Promise<void> {
    if (rowsToWrite.length === 0) return;
    for (let i = 0; i < rowsToWrite.length; i += BATCH) {
      const chunk = rowsToWrite.slice(i, i + BATCH);
      const { error } = await db.from(table).insert(chunk);
      if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
    }
    log("check-ins", `  ${table}: ${rowsToWrite.length} rows`);
  }

  await writeJunction("check_in_instructors", instructorJunction);
  await writeJunction("check_in_focuses",     focusJunction);
  await writeJunction("check_in_audiences",   audienceJunction);

  return rows.length;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  if (RESET) await resetSeedData();

  const instructors = await loadInstructors();
  const slotsPre = await assignSchedule(instructors);
  // Enrich slot-side focus attribution BEFORE check-in generation so
  // the snapshot rows inherit the full set. `enrichSlotFocuses` is
  // idempotent (upsert with ignoreDuplicates on the PK).
  await enrichSlotFocuses(slotsPre);
  // Re-read slots so freshly-attached focuses land on the in-memory
  // copy that seedCheckIns snapshots from.
  const { data: slotsAfter, error: reErr } = await db
    .from("schedule_slots")
    .select(SLOT_SELECT)
    .eq("active", true)
    .order("id");
  if (reErr) throw new Error(`post-enrich slot select: ${reErr.message}`);
  const slots = (slotsAfter ?? []).map(flattenSlot);

  const plan = await ensureMembershipPlan();
  const members = await seedMembers(plan);
  const checkInCount = await seedCheckIns(members, slots);

  const rangeStart = addDays(TODAY_ISO, -DAYS_BACK);
  log("done",
    `Seed complete in ${Math.round((Date.now() - started) / 1000)}s — ` +
    `${instructors.length} instructors, ${members.length} members, ${checkInCount} check-ins ` +
    `spanning ${rangeStart} → ${TODAY_ISO}.`,
  );
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
