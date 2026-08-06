/**
 * Fixture-based unit tests for the WS5 dimension-aware metrics
 * (class-taxonomy-LLD §5.1). Mirrors the pattern in `period.test.ts`:
 * no Supabase roundtrip — we stub the query builder with an object that
 * records the call path and resolves to a preset data array.
 *
 * What we're actually guarding against:
 *   - Group-by keys collide when `modality_id` is NULL.
 *   - `check_in_audiences` + `check_in_focuses` counts reflect the
 *     junction-row count (not the unique check-in count).
 *   - Filters short-circuit correctly when the audience pre-query
 *     returns an empty id set.
 *   - Sort order is descending by count.
 */

import { describe, expect, it } from "vitest";

import {
  countByModality,
  countByLevel,
  countByFocus,
  countByAudience,
  modalityDailyTrend,
  instructorModalityMatrix,
} from "@/lib/analytics/metrics";
import type { Period } from "@/lib/analytics/types";

const PERIOD: Period = {
  start: "2026-04-01",
  end: "2026-04-30",
  tz: "America/Chicago",
  label: "month",
};

/**
 * Minimal chainable builder mock. Every method returns `this` except
 * `maybeSingle` (unused in these tests). The mock is given a `table →
 * rows` lookup so the metrics under test see realistic shapes.
 *
 * We don't try to simulate WHERE semantics — the tests inject the
 * already-filtered row set for each table. That keeps the assertions
 * about the metric logic, not the mock.
 */
function makeClient(fixtures: Record<string, unknown[]>) {
  // Shared builder — we record the "current table" as state so a single
  // client can satisfy multiple `.from(...)` calls in sequence. Every
  // chainable method returns the builder; the whole object is thenable
  // so `await query` resolves to `{ data, count }`.
  let currentTable = "";
  type Builder = {
    select: (..._: unknown[]) => Builder;
    gte: (..._: unknown[]) => Builder;
    lte: (..._: unknown[]) => Builder;
    in: (..._: unknown[]) => Builder;
    eq: (..._: unknown[]) => Builder;
    order: (..._: unknown[]) => Builder;
    then: (resolve: (v: { data: unknown[]; count?: number }) => unknown) => Promise<unknown>;
  };
  const builder: Builder = {
    select: () => builder,
    gte:    () => builder,
    lte:    () => builder,
    in:     () => builder,
    eq:     () => builder,
    order:  () => builder,
    then: (resolve) => {
      const data = fixtures[currentTable] ?? [];
      return Promise.resolve(resolve({ data, count: data.length }));
    },
  };
  return {
    from: (table: string) => {
      currentTable = table;
      return builder;
    },
  } as unknown as Parameters<typeof countByModality>[0];
}

describe("countByModality", () => {
  it("groups by (modality_id, modality_name) with descending counts", async () => {
    const client = makeClient({
      check_ins: [
        { modality_id: 1, modality_name: "Gi" },
        { modality_id: 1, modality_name: "Gi" },
        { modality_id: 2, modality_name: "No-Gi" },
        { modality_id: null, modality_name: null },
      ],
    });
    const result = await countByModality(client, PERIOD);
    expect(result).toEqual([
      { modalityId: 1, name: "Gi", count: 2 },
      { modalityId: 2, name: "No-Gi", count: 1 },
      { modalityId: null, name: "Unspecified", count: 1 },
    ]);
  });

  it("labels NULL modality_name as 'Unspecified'", async () => {
    const client = makeClient({
      check_ins: [{ modality_id: null, modality_name: null }],
    });
    const result = await countByModality(client, PERIOD);
    expect(result).toEqual([{ modalityId: null, name: "Unspecified", count: 1 }]);
  });
});

describe("countByLevel", () => {
  it("groups NULL level under 'Unspecified' (matches COALESCE contract)", async () => {
    const client = makeClient({
      check_ins: [
        { level_id: 1, level_name: "Fundamentals" },
        { level_id: null, level_name: null },
        { level_id: null, level_name: null },
      ],
    });
    const result = await countByLevel(client, PERIOD);
    expect(result).toEqual([
      { levelId: null, name: "Unspecified", count: 2 },
      { levelId: 1, name: "Fundamentals", count: 1 },
    ]);
  });
});

describe("countByFocus", () => {
  it("sums junction rows, not distinct check-ins", async () => {
    const client = makeClient({
      check_ins: [{ id: 1 }, { id: 2 }],
      check_in_focuses: [
        // check-in 1 credits two focuses; check-in 2 credits one.
        { focus_id: 10, focus_name: "Leg Locks" },
        { focus_id: 11, focus_name: "Takedowns" },
        { focus_id: 10, focus_name: "Leg Locks" },
      ],
    });
    const result = await countByFocus(client, PERIOD);
    expect(result).toEqual([
      { focusId: 10, name: "Leg Locks", count: 2 },
      { focusId: 11, name: "Takedowns", count: 1 },
    ]);
  });

  it("returns [] when no check-ins match the period", async () => {
    const client = makeClient({
      check_ins: [],
      check_in_focuses: [],
    });
    const result = await countByFocus(client, PERIOD);
    expect(result).toEqual([]);
  });
});

describe("countByAudience", () => {
  it("carries `kind` into the output buckets", async () => {
    const client = makeClient({
      check_ins: [{ id: 1 }],
      check_in_audiences: [
        { audience_id: 5, audience_name: "Women Only", audience_kind: "gender" },
        { audience_id: 6, audience_name: "Age 40+", audience_kind: "age" },
      ],
    });
    const result = await countByAudience(client, PERIOD);
    expect(result).toEqual([
      { audienceId: 5, name: "Women Only", kind: "gender", count: 1 },
      { audienceId: 6, name: "Age 40+", kind: "age", count: 1 },
    ]);
  });
});

describe("modalityDailyTrend", () => {
  it("pivots check_ins into a Map<modalityId, Map<date, count>>", async () => {
    const client = makeClient({
      check_ins: [
        { class_date: "2026-04-10", modality_id: 1 },
        { class_date: "2026-04-10", modality_id: 1 },
        { class_date: "2026-04-11", modality_id: 1 },
        { class_date: "2026-04-10", modality_id: 2 },
      ],
    });
    const out = await modalityDailyTrend(client, PERIOD, [1, 2]);
    expect(out.get(1)?.get("2026-04-10")).toBe(2);
    expect(out.get(1)?.get("2026-04-11")).toBe(1);
    expect(out.get(2)?.get("2026-04-10")).toBe(1);
  });

  it("ignores modalities outside the requested id set", async () => {
    const client = makeClient({
      check_ins: [{ class_date: "2026-04-10", modality_id: 99 }],
    });
    const out = await modalityDailyTrend(client, PERIOD, [1]);
    expect(out.size).toBe(0);
  });
});

describe("instructorModalityMatrix", () => {
  it("credits every instructor-check_in_instructors row with one count", async () => {
    const client = makeClient({
      check_ins: [
        { id: 1, modality_id: 1, modality_name: "Gi" },
        { id: 2, modality_id: 1, modality_name: "Gi" },
        { id: 3, modality_id: 2, modality_name: "No-Gi" },
      ],
      check_in_instructors: [
        { check_in_id: 1, instructor_id: 100, instructor_name: "Walter" },
        { check_in_id: 2, instructor_id: 100, instructor_name: "Walter" },
        { check_in_id: 3, instructor_id: 101, instructor_name: "Rose" },
      ],
    });
    const out = await instructorModalityMatrix(client, PERIOD);
    // Walter has 2 Gi check-ins, Rose has 1 No-Gi.
    expect(out).toEqual([
      {
        instructor_id: 100,
        instructor_name: "Walter",
        modality_id: 1,
        modality_name: "Gi",
        count: 2,
      },
      {
        instructor_id: 101,
        instructor_name: "Rose",
        modality_id: 2,
        modality_name: "No-Gi",
        count: 1,
      },
    ]);
  });
});
