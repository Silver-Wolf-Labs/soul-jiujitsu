import { describe, expect, it } from "vitest";
import { toCsv, buildCsvFilename, type CsvColumn } from "@/lib/analytics/csv";

interface Row {
  name: string;
  count: number;
  joined: string;
  notes: string | null;
}

const COLUMNS: CsvColumn<Row>[] = [
  { key: "name", label: "Member" },
  { key: "count", label: "Check-ins" },
  { key: "joined", label: "Joined" },
  { key: "notes", label: "Notes" },
];

describe("toCsv", () => {
  it("emits RFC 4180-style quoted CSV with CRLF lines", () => {
    const rows: Row[] = [
      { name: "Alex", count: 12, joined: "2026-01-01", notes: null },
      { name: "Jane \"JJ\" Doe", count: 3, joined: "2026-02-15", notes: "notes, with comma" },
    ];
    const csv = toCsv(COLUMNS, rows);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(`"Member","Check-ins","Joined","Notes"`);
    expect(lines[1]).toBe(`"Alex","12","2026-01-01",""`);
    // Embedded quotes must be doubled, commas within quoted fields stay intact.
    expect(lines[2]).toBe(`"Jane ""JJ"" Doe","3","2026-02-15","notes, with comma"`);
  });

  it("defers to a column's `format` callback when present", () => {
    const rows: Row[] = [{ name: "Alex", count: 12, joined: "2026-01-01", notes: null }];
    const csv = toCsv(
      [
        { key: "name", label: "Member" },
        { key: "count", label: "Check-ins", format: (v) => `${v}x` },
      ],
      rows,
    );
    expect(csv.split("\r\n")[1]).toBe(`"Alex","12x"`);
  });
});

describe("buildCsvFilename", () => {
  it("sanitizes each part and stitches them together", () => {
    const name = buildCsvFilename({
      gymShortName: "Soul JJ",
      report: "class popularity",
      start: "2026-04-13",
      end: "2026-04-19",
    });
    expect(name).toBe("Soul-JJ_class-popularity_2026-04-13_2026-04-19.csv");
  });

  it("collapses runs of unsafe characters and trims the edges", () => {
    const name = buildCsvFilename({
      gymShortName: "---My Gym!!",
      report: "at_risk_report",
      start: "2026-04-01",
      end: "2026-04-30",
    });
    expect(name).toBe("My-Gym_at-risk-report_2026-04-01_2026-04-30.csv");
  });
});
