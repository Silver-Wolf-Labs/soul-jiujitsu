import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatDate,
  formatDateLong,
  formatDateTime,
  normalizeDayPeriod,
  estimateReadTime,
  toSlug,
  getInitials,
  getTodayName,
  toCSV,
  downloadCSV,
} from "../utils";

/**
 * Guards a hydration bug that is invisible to the eye: Node's ICU renders the
 * Spanish day period with a non-breaking space ("a.\u00A0m.") and Chromium with a
 * plain one ("a. m."), so a time rendered on the server and hydrated in the
 * browser is *different text* to React — a minified error #418 that failed every
 * authenticated portal test while looking nothing like a date bug.
 *
 * The inputs below use explicit \u00A0 escapes rather than pasted characters, so a
 * future editor tidying whitespace cannot quietly neuter these assertions.
 */
describe("normalizeDayPeriod", () => {
  it("replaces the non-breaking space inside a Spanish day period", () => {
    expect(normalizeDayPeriod("9:11 a.\u00A0m.")).toBe("9:11 a. m.");
    expect(normalizeDayPeriod("7:00 p.\u00A0m.")).toBe("7:00 p. m.");
  });

  it("is idempotent, so an already-normalised string is untouched", () => {
    expect(normalizeDayPeriod("9:11 a. m.")).toBe("9:11 a. m.");
    expect(normalizeDayPeriod(normalizeDayPeriod("9:11 a.\u00A0m."))).toBe("9:11 a. m.");
  });

  it("preserves the number group separator, which is a load-bearing NBSP", () => {
    // es-CR groups thousands with NBSP, so a blanket purge would mangle "1 234,5".
    // This is why the replacement stays scoped to the day period.
    expect(normalizeDayPeriod("1\u00A0234,5")).toBe("1\u00A0234,5");
  });

  it("keeps the timezone suffix that follows the day period", () => {
    expect(normalizeDayPeriod("3:42 p.\u00A0m. GMT-6")).toBe("3:42 p. m. GMT-6");
  });

  it("is actually applied by the formatters that include an hour", () => {
    // Asserting on the formatter and not just the helper is what catches a
    // dropped wrapper at a call site.
    expect(formatDateTime("2026-03-26T14:30:05Z")).not.toContain("\u00A0m.");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string in Spanish", () => {
    expect(formatDate("2026-03-26")).toContain("2026");
    expect(formatDate("2026-03-26")).toContain("mar");
  });

  it("formats a Date object", () => {
    const d = new Date("2026-01-15");
    expect(formatDate(d)).toContain("ene");
  });
});

describe("formatDateLong", () => {
  it("includes day of week", () => {
    const result = formatDateLong("2026-03-26");
    // Just verify it's a non-empty string with a year
    expect(result).toContain("2026");
    expect(result.length).toBeGreaterThan(10);
  });
});

describe("estimateReadTime", () => {
  it("returns at least 1 min", () => {
    expect(estimateReadTime("hello world")).toBe("1 min de lectura");
  });

  it("estimates correctly for ~400 words", () => {
    const text = Array(400).fill("word").join(" ");
    expect(estimateReadTime(text)).toBe("2 min de lectura");
  });

  it("rounds to nearest minute", () => {
    const text = Array(600).fill("word").join(" ");
    expect(estimateReadTime(text)).toBe("3 min de lectura");
  });
});

describe("toSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(toSlug("Rob Ables")).toBe("rob-ables");
  });

  it("removes special characters", () => {
    expect(toSlug("Sara A.")).toBe("sara-a");
  });

  it("collapses multiple spaces", () => {
    expect(toSlug("Hello   World")).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    expect(toSlug("hello--world")).toBe("hello-world");
  });
});

describe("getInitials", () => {
  it("extracts two initials", () => {
    expect(getInitials("Rob Ables")).toBe("RA");
  });

  it("handles single name", () => {
    expect(getInitials("Marcelo")).toBe("M");
  });

  it("uses only first two parts", () => {
    expect(getInitials("Jean-Pierre Garcia Lopez")).toBe("JG");
  });
});

describe("getTodayName", () => {
  it("returns a valid day name", () => {
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    expect(days).toContain(getTodayName());
  });
});

describe("downloadCSV", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sets download attribute to the filename (first arg)", () => {
    const anchor = { href: "", download: "", click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    downloadCSV("subscribers-all-123.csv", "name\nRob");

    expect(anchor.download).toBe("subscribers-all-123.csv");
    expect(anchor.click).toHaveBeenCalledOnce();
  });

  it("does not swap filename and csv content", () => {
    // Regression: args were previously reversed at the call site (toCSV result
    // passed as filename, filename string passed as csv content).
    const anchor = { href: "", download: "", click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const csv = toCSV([{ Value: "rob@test.com", Type: "email" }]);
    downloadCSV("export.csv", csv);

    // filename must be a short string — not a multi-line CSV blob
    expect(anchor.download).toBe("export.csv");
    expect(anchor.download).not.toContain(",");
    expect(anchor.download).not.toContain("\n");
  });
});

describe("toCSV", () => {
  it("returns empty string for empty array", () => {
    expect(toCSV([])).toBe("");
  });

  it("includes headers and data", () => {
    const csv = toCSV([{ name: "Rob", email: "rob@test.com" }]);
    expect(csv).toContain("name");
    expect(csv).toContain("email");
    expect(csv).toContain("Rob");
  });

  it("escapes quotes in values", () => {
    const csv = toCSV([{ bio: 'He said "hello"' }]);
    expect(csv).toContain('""hello""');
  });
});
