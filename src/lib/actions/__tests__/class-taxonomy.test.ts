/**
 * Unit tests for src/lib/actions/class-taxonomy.ts.
 *
 * Covers: create/update/deactivate for each of the four dimensions,
 * admin gating (unauthenticated calls redirect), audit-log emission,
 * and the `{ slotCount, checkInCount }` pre-flight query (scalar tables
 * for modality/level; junction tables for focus/audience).
 *
 * Supabase is stubbed with a tiny chainable mock so the tests exercise
 * the actual table/column wiring without hitting a live DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// `next/cache` is imported at module scope by the action file. Stub it out.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Admin gate — default lets everything through. Individual tests override.
const requireAdminMock = vi.fn(async () => ({ id: "admin-user" }));
vi.mock("@/lib/supabase/require-admin", () => ({
  requireAdmin: (...args: unknown[]) => (requireAdminMock as (...a: unknown[]) => unknown)(...args),
}));

// Audit — tests assert on these calls.
const logAuditEventMock = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => (logAuditEventMock as (...a: unknown[]) => unknown)(...args),
}));

// Supabase server client — the fluent mock below is swapped in per-test.
const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

// ── Chainable Supabase mock ─────────────────────────────────────────────

type Captured = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
  selectArgs?: [string, Record<string, unknown> | undefined];
};

type QueryScript = {
  /** What the terminal call should resolve to. */
  result?: { data?: unknown; error?: unknown; count?: number };
  /** Capture slot for test assertions. */
  onTerminate?: (captured: Captured) => void;
};

/**
 * Build a chainable query builder that collects the operation + filters
 * and returns `result` from `.single()`, `.maybeSingle()`, or when used
 * as a thenable (e.g. `await query`).
 */
function makeQuery(table: string, script: QueryScript) {
  const captured: Captured = {
    table,
    op: "select",
    filters: [],
  };

  const api: Record<string, unknown> = {};
  const chain = () => api;

  api.select = (cols: string, opts?: Record<string, unknown>) => {
    captured.selectArgs = [cols, opts];
    return api;
  };
  api.insert = (payload: unknown) => {
    captured.op = "insert";
    captured.payload = payload;
    return api;
  };
  api.update = (payload: unknown) => {
    captured.op = "update";
    captured.payload = payload;
    return api;
  };
  api.delete = () => {
    captured.op = "delete";
    return api;
  };
  api.eq = (col: string, val: unknown) => {
    captured.filters.push(["eq", col, val]);
    return api;
  };
  api.order = chain;
  api.limit = chain;

  const settle = async () => {
    script.onTerminate?.(captured);
    const r = script.result ?? { data: null };
    return r;
  };

  api.single = settle;
  api.maybeSingle = settle;
  // Thenable for `await supabase.from(..).select(...).eq(...)` style.
  api.then = (resolve: (v: unknown) => unknown, reject?: (v: unknown) => unknown) =>
    settle().then(resolve, reject);

  return api;
}

/**
 * Stand up a Supabase client whose `.from(table)` returns queries driven
 * by a per-table queue. Each queue entry is used in FIFO order.
 */
function stubSupabase(queues: Record<string, QueryScript[]>) {
  const captures: Captured[] = [];
  const client = {
    from: (table: string) => {
      const queue = queues[table];
      if (!queue || queue.length === 0) {
        throw new Error(`[test stub] no script queued for table ${table}`);
      }
      const script = queue.shift()!;
      const wrapped: QueryScript = {
        result: script.result,
        onTerminate: (c) => {
          captures.push(c);
          script.onTerminate?.(c);
        },
      };
      return makeQuery(table, wrapped);
    },
  };
  return { client, captures };
}

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockImplementation(async () => ({ id: "admin-user" }));
  logAuditEventMock.mockReset();
  createClientMock.mockReset();
});

// ── Modalities ──────────────────────────────────────────────────────────

describe("createModality", () => {
  it("inserts a slugified modality and audits", async () => {
    const { client, captures } = stubSupabase({
      class_modalities: [
        {
          result: {
            data: { id: 42, name: "Judo", slug: "judo", color: "#fff", active: true, sort_order: 60 },
            error: null,
          },
        },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { createModality } = await import("../class-taxonomy");
    const row = await createModality({ name: "  Judo  ", color: "#fff", sort_order: 60 });

    expect(row.id).toBe(42);
    expect(captures[0]?.op).toBe("insert");
    const payload = captures[0]?.payload as { name: string; slug: string; color: string; sort_order: number };
    expect(payload.name).toBe("Judo");
    expect(payload.slug).toBe("judo"); // auto-generated from name
    expect(payload.color).toBe("#fff");
    expect(payload.sort_order).toBe(60);

    expect(requireAdminMock).toHaveBeenCalledOnce();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "CREATE",
      "class_modalities",
      42,
      expect.objectContaining({ name: "Judo", slug: "judo" }),
    );
  });

  it("honors an explicit slug override", async () => {
    const { client, captures } = stubSupabase({
      class_modalities: [
        { result: { data: { id: 1 }, error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { createModality } = await import("../class-taxonomy");
    await createModality({ name: "Competition Prep", slug: "COMP-prep" });

    const payload = captures[0]?.payload as { slug: string };
    expect(payload.slug).toBe("comp-prep");
  });

  it("rejects non-admin callers", async () => {
    requireAdminMock.mockImplementationOnce(async () => {
      throw new Error("redirect:/admin/login");
    });

    const { createModality } = await import("../class-taxonomy");
    await expect(createModality({ name: "Judo" })).rejects.toThrow(/redirect/);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects empty names with a clear error", async () => {
    const { createModality } = await import("../class-taxonomy");
    await expect(createModality({ name: "   " })).rejects.toThrow(/name is required/i);
  });
});

describe("updateModality", () => {
  it("applies a partial patch and audits before/after", async () => {
    const { client, captures } = stubSupabase({
      class_modalities: [
        // before snapshot
        {
          result: {
            data: { id: 5, name: "Gi", slug: "gi", color: null, active: true, sort_order: 10 },
            error: null,
          },
        },
        // update
        { result: { error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { updateModality } = await import("../class-taxonomy");
    await updateModality(5, { name: "Gi Jiu-Jitsu", color: "#3E63DD" });

    expect(captures[1]?.op).toBe("update");
    expect(captures[1]?.payload).toMatchObject({ name: "Gi Jiu-Jitsu", color: "#3E63DD" });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "UPDATE",
      "class_modalities",
      5,
      expect.objectContaining({ after: expect.objectContaining({ name: "Gi Jiu-Jitsu" }) }),
    );
  });
});

describe("deactivateModality", () => {
  it("runs pre-flight counts, returns them, flips active=false, audits", async () => {
    const { client, captures } = stubSupabase({
      schedule_slots: [
        { result: { data: null, error: null, count: 3 } },
      ],
      check_ins: [
        { result: { data: null, error: null, count: 12 } },
      ],
      class_modalities: [
        { result: { error: null } }, // update
      ],
    });
    createClientMock.mockReturnValue(client);

    const { deactivateModality } = await import("../class-taxonomy");
    const counts = await deactivateModality(7);

    expect(counts).toEqual({ slotCount: 3, checkInCount: 12 });

    // Pre-flight selects used `modality_id` as the filter key on both scalar tables.
    const slotQ = captures.find((c) => c.table === "schedule_slots");
    const ciQ = captures.find((c) => c.table === "check_ins");
    expect(slotQ?.filters).toContainEqual(["eq", "modality_id", 7]);
    expect(ciQ?.filters).toContainEqual(["eq", "modality_id", 7]);
    expect(slotQ?.selectArgs?.[1]).toMatchObject({ count: "exact", head: true });

    // Update payload.
    const upd = captures.find((c) => c.table === "class_modalities");
    expect(upd?.op).toBe("update");
    expect(upd?.payload).toEqual({ active: false });

    expect(logAuditEventMock).toHaveBeenCalledWith(
      "TOGGLE",
      "class_modalities",
      7,
      expect.objectContaining({ field: "active", from: true, to: false, slotCount: 3, checkInCount: 12 }),
    );
  });
});

// ── Levels ──────────────────────────────────────────────────────────────

describe("createLevel", () => {
  it("inserts and audits", async () => {
    const { client, captures } = stubSupabase({
      class_levels: [
        { result: { data: { id: 3, name: "Advanced", slug: "advanced" }, error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { createLevel } = await import("../class-taxonomy");
    await createLevel({ name: "Advanced" });

    expect(captures[0]?.op).toBe("insert");
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "CREATE",
      "class_levels",
      3,
      expect.objectContaining({ name: "Advanced", slug: "advanced" }),
    );
  });

  it("gates on admin", async () => {
    requireAdminMock.mockImplementationOnce(async () => {
      throw new Error("unauthorized");
    });
    const { createLevel } = await import("../class-taxonomy");
    await expect(createLevel({ name: "Advanced" })).rejects.toThrow(/unauthorized/);
  });
});

describe("updateLevel", () => {
  it("patches fields and records before/after", async () => {
    const { client, captures } = stubSupabase({
      class_levels: [
        {
          result: {
            data: { id: 8, name: "All Levels", slug: "all-levels", active: true, sort_order: 10 },
            error: null,
          },
        },
        { result: { error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { updateLevel } = await import("../class-taxonomy");
    await updateLevel(8, { name: "All levels (open)" });

    expect(captures[1]?.payload).toMatchObject({ name: "All levels (open)" });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "UPDATE",
      "class_levels",
      8,
      expect.objectContaining({ after: expect.objectContaining({ name: "All levels (open)" }) }),
    );
  });
});

describe("deactivateLevel", () => {
  it("returns scalar-table counts and sets active=false", async () => {
    const { client, captures } = stubSupabase({
      schedule_slots: [
        { result: { count: 2, data: null, error: null } },
      ],
      check_ins: [
        { result: { count: 5, data: null, error: null } },
      ],
      class_levels: [
        { result: { error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { deactivateLevel } = await import("../class-taxonomy");
    const counts = await deactivateLevel(4);

    expect(counts).toEqual({ slotCount: 2, checkInCount: 5 });
    const slotQ = captures.find((c) => c.table === "schedule_slots");
    expect(slotQ?.filters).toContainEqual(["eq", "level_id", 4]);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "TOGGLE",
      "class_levels",
      4,
      expect.objectContaining({ slotCount: 2, checkInCount: 5 }),
    );
  });
});

// ── Focuses ─────────────────────────────────────────────────────────────

describe("createFocus", () => {
  it("inserts and audits", async () => {
    const { client, captures } = stubSupabase({
      class_focuses: [
        { result: { data: { id: 11, name: "Leg Locks", slug: "leg-locks" }, error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { createFocus } = await import("../class-taxonomy");
    await createFocus({ name: "Leg Locks" });

    expect(captures[0]?.op).toBe("insert");
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "CREATE",
      "class_focuses",
      11,
      expect.objectContaining({ name: "Leg Locks", slug: "leg-locks" }),
    );
  });
});

describe("updateFocus", () => {
  it("patches name and audits", async () => {
    const { client, captures } = stubSupabase({
      class_focuses: [
        { result: { data: { id: 9, name: "Takedowns", slug: "takedowns" }, error: null } },
        { result: { error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { updateFocus } = await import("../class-taxonomy");
    await updateFocus(9, { name: "Takedowns & Throws" });

    expect(captures[1]?.payload).toMatchObject({ name: "Takedowns & Throws" });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "UPDATE",
      "class_focuses",
      9,
      expect.any(Object),
    );
  });
});

describe("deactivateFocus", () => {
  it("counts from the focus junction tables, not scalar parents", async () => {
    const { client, captures } = stubSupabase({
      schedule_slot_focuses: [
        { result: { count: 4, data: null, error: null } },
      ],
      check_in_focuses: [
        { result: { count: 9, data: null, error: null } },
      ],
      class_focuses: [
        { result: { error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { deactivateFocus } = await import("../class-taxonomy");
    const counts = await deactivateFocus(2);

    expect(counts).toEqual({ slotCount: 4, checkInCount: 9 });

    const slotQ = captures.find((c) => c.table === "schedule_slot_focuses");
    const ciQ = captures.find((c) => c.table === "check_in_focuses");
    expect(slotQ?.filters).toContainEqual(["eq", "focus_id", 2]);
    expect(ciQ?.filters).toContainEqual(["eq", "focus_id", 2]);
    expect(slotQ?.selectArgs?.[1]).toMatchObject({ count: "exact", head: true });

    expect(logAuditEventMock).toHaveBeenCalledWith(
      "TOGGLE",
      "class_focuses",
      2,
      expect.objectContaining({ slotCount: 4, checkInCount: 9 }),
    );
  });
});

// ── Audiences ───────────────────────────────────────────────────────────

describe("createAudience", () => {
  it("age kind: accepts min/max, forces null gender, audits", async () => {
    const { client, captures } = stubSupabase({
      class_audiences: [
        { result: { data: { id: 20, name: "Age 7-10", slug: "age-7-10", kind: "age" }, error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { createAudience } = await import("../class-taxonomy");
    await createAudience({ name: "Age 7-10", kind: "age", min_age: 7, max_age: 10 });

    const payload = captures[0]?.payload as Record<string, unknown>;
    expect(payload.kind).toBe("age");
    expect(payload.min_age).toBe(7);
    expect(payload.max_age).toBe(10);
    expect(payload.gender).toBeNull();

    expect(logAuditEventMock).toHaveBeenCalledWith(
      "CREATE",
      "class_audiences",
      20,
      expect.objectContaining({ kind: "age" }),
    );
  });

  it("age kind: rejects when neither bound is given", async () => {
    createClientMock.mockReturnValue({ from: () => { throw new Error("should not be called"); } });
    const { createAudience } = await import("../class-taxonomy");
    await expect(createAudience({ name: "Any age", kind: "age" })).rejects.toThrow(/min_age or max_age/i);
  });

  it("age kind: rejects when min > max", async () => {
    const { createAudience } = await import("../class-taxonomy");
    await expect(createAudience({ name: "bad", kind: "age", min_age: 10, max_age: 5 }))
      .rejects.toThrow(/min_age.*max_age/);
  });

  it("gender kind: requires a gender value", async () => {
    const { createAudience } = await import("../class-taxonomy");
    await expect(createAudience({ name: "Women Only", kind: "gender" }))
      .rejects.toThrow(/gender audience requires/i);
  });

  it("gender kind: persists gender and nulls age bounds", async () => {
    const { client, captures } = stubSupabase({
      class_audiences: [
        { result: { data: { id: 31, name: "Women Only", slug: "women-only", kind: "gender" }, error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { createAudience } = await import("../class-taxonomy");
    await createAudience({ name: "Women Only", kind: "gender", gender: "female" });

    const payload = captures[0]?.payload as Record<string, unknown>;
    expect(payload.gender).toBe("female");
    expect(payload.min_age).toBeNull();
    expect(payload.max_age).toBeNull();
  });

  it("rank/access kinds: reject any enforcement metadata", async () => {
    const { createAudience } = await import("../class-taxonomy");
    await expect(
      createAudience({ name: "Black Belts Only", kind: "rank", min_age: 10 }),
    ).rejects.toThrow(/does not accept enforcement metadata/);
    await expect(
      createAudience({ name: "Invite Only", kind: "access", gender: "female" }),
    ).rejects.toThrow(/does not accept enforcement metadata/);
  });

  it("rejects non-admin callers", async () => {
    requireAdminMock.mockImplementationOnce(async () => {
      throw new Error("forbidden");
    });
    const { createAudience } = await import("../class-taxonomy");
    await expect(
      createAudience({ name: "Age 7-10", kind: "age", min_age: 7, max_age: 10 }),
    ).rejects.toThrow(/forbidden/);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

describe("updateAudience", () => {
  it("validates the resulting shape using the effective kind", async () => {
    const { client } = stubSupabase({
      class_audiences: [
        // before: gender=female
        {
          result: {
            data: { id: 4, name: "Women Only", slug: "women-only", kind: "gender", gender: "female", min_age: null, max_age: null, active: true, sort_order: 50 },
            error: null,
          },
        },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { updateAudience } = await import("../class-taxonomy");
    // Switching to age without bounds is invalid even though the before
    // row had no age fields — the resulting row would violate the CHECK.
    await expect(updateAudience(4, { kind: "age" })).rejects.toThrow(/min_age or max_age/i);
  });

  it("happy path updates + audits with before/after", async () => {
    const { client, captures } = stubSupabase({
      class_audiences: [
        {
          result: {
            data: { id: 17, name: "Age 40+", slug: "age-40-plus", kind: "age", min_age: 40, max_age: null, gender: null, active: true, sort_order: 40 },
            error: null,
          },
        },
        { result: { error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { updateAudience } = await import("../class-taxonomy");
    await updateAudience(17, { name: "Age 40 and up" });

    expect(captures[1]?.op).toBe("update");
    expect(captures[1]?.payload).toMatchObject({ name: "Age 40 and up" });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "UPDATE",
      "class_audiences",
      17,
      expect.objectContaining({ before: expect.any(Object), after: expect.any(Object) }),
    );
  });
});

describe("deactivateAudience", () => {
  it("counts via audience junctions and returns both numbers", async () => {
    const { client, captures } = stubSupabase({
      schedule_slot_audiences: [
        { result: { count: 1, data: null, error: null } },
      ],
      check_in_audiences: [
        { result: { count: 0, data: null, error: null } },
      ],
      class_audiences: [
        { result: { error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { deactivateAudience } = await import("../class-taxonomy");
    const counts = await deactivateAudience(9);

    expect(counts).toEqual({ slotCount: 1, checkInCount: 0 });
    const slotQ = captures.find((c) => c.table === "schedule_slot_audiences");
    expect(slotQ?.filters).toContainEqual(["eq", "audience_id", 9]);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      "TOGGLE",
      "class_audiences",
      9,
      expect.objectContaining({ slotCount: 1, checkInCount: 0 }),
    );
  });
});

// ── Delete gating (focus/audience allow it, gated by slot usage) ───────

describe("deleteFocus", () => {
  it("refuses when slots still reference the row", async () => {
    const { client } = stubSupabase({
      schedule_slot_focuses: [
        { result: { count: 3, data: null, error: null } },
      ],
      check_in_focuses: [
        { result: { count: 0, data: null, error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { deleteFocus } = await import("../class-taxonomy");
    await expect(deleteFocus(12)).rejects.toThrow(/Deactivate instead/);
  });

  it("deletes and audits when nothing references it", async () => {
    const { client, captures } = stubSupabase({
      schedule_slot_focuses: [
        { result: { count: 0, data: null, error: null } },
      ],
      check_in_focuses: [
        { result: { count: 0, data: null, error: null } },
      ],
      class_focuses: [
        // before snapshot
        { result: { data: { id: 12, name: "Orphan Focus" }, error: null } },
        // delete
        { result: { error: null } },
      ],
    });
    createClientMock.mockReturnValue(client);

    const { deleteFocus } = await import("../class-taxonomy");
    await deleteFocus(12);

    const del = captures.find((c) => c.table === "class_focuses" && c.op === "delete");
    expect(del).toBeDefined();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      "DELETE",
      "class_focuses",
      12,
      expect.objectContaining({ deleted: expect.any(Object) }),
    );
  });
});
