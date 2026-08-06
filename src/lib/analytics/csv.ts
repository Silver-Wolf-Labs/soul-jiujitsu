/**
 * Tiny CSV export utility — admin-tablet-first, Excel-friendly.
 *
 * Every analytics table offers a one-click CSV download. We keep the
 * generation client-side so there's no round-trip, and because the data
 * is already in hand from the server-rendered payload.
 *
 * Conventions:
 *   - RFC 4180 quoting (double-quote + escape embedded quotes).
 *   - UTF-8 + BOM so Excel picks up accents / em-dashes correctly.
 *   - CRLF line endings (also Excel-friendly).
 *   - Filename: `{gym}_{report}_{start}_{end}.csv` — ISO dates, always.
 */

export type CsvValue = string | number | null | undefined | Date;

// Loose row type — interfaces with fixed keys don't satisfy
// `Record<string, unknown>` under strict mode (no index signature). Accept
// any object shape; per-column type safety comes from `keyof T & string`
// on the column descriptor. Values are coerced inside `defaultFormat`.
export type CsvRow = object;

export interface CsvColumn<T extends CsvRow> {
  key: keyof T & string;
  label: string;
  /** Optional formatter — useful for numbers, dates, rounded percents. */
  format?: (value: T[keyof T & string], row: T) => string;
}

/**
 * Build a CSV string from typed rows.
 * Keep columns explicit so the export schema doesn't drift with UI tweaks.
 */
export function toCsv<T extends CsvRow>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map(c => quote(c.label)).join(",");
  const body = rows.map(row => {
    const indexed = row as Record<string, unknown>;
    return columns
      .map(col => {
        const raw = indexed[col.key];
        const formatted = col.format
          ? col.format(raw as T[keyof T & string], row)
          : defaultFormat(raw);
        return quote(formatted);
      })
      .join(",");
  });
  return [header, ...body].join("\r\n");
}

function defaultFormat(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function quote(s: string): string {
  // RFC 4180: double quotes wrap; embedded quotes are doubled.
  return `"${s.replace(/"/g, '""')}"`;
}

/** Triggers a browser download of the provided CSV content. */
export function downloadCsv(filename: string, csv: string): void {
  // UTF-8 BOM prefix (\ufeff) so Excel picks up the encoding automatically.
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Canonical filename builder. Keep names predictable so a gym owner
 * exporting the same report two days in a row can tell them apart at
 * a glance.
 */
export function buildCsvFilename(parts: {
  gymShortName: string;
  report: string;
  start: string;
  end: string;
}): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe(parts.gymShortName)}_${safe(parts.report)}_${parts.start}_${parts.end}.csv`;
}
