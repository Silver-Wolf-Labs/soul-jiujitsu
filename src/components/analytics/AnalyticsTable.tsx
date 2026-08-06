import { toCsv, buildCsvFilename, type CsvColumn, type CsvRow } from "@/lib/analytics/csv";
import ExportButton from "./ExportButton";

interface Props<T extends CsvRow> {
  title: string;
  /** Short description under the title. Optional. */
  caption?: string;
  rows: T[];
  columns: CsvColumn<T>[];
  /** Optional renderer per cell — receives typed row + column. Runs on the
   *  server because this is a Server Component, so function props are fine
   *  here (no RSC boundary crossed). */
  render?: (column: CsvColumn<T>, row: T) => React.ReactNode;
  /** Filename parts for CSV download. Report slug must be stable. */
  exportSlug: string;
  exportRange: { gymShortName: string; start: string; end: string };
  /** When empty, render a compact non-judgmental placeholder instead of a table. */
  emptyHint?: string;
  /** Right-align numeric columns by key. Purely cosmetic. */
  numericKeys?: string[];
}

// Per-call cast so the indexed lookup on a generic `T extends object` stays
// type-safe without forcing every call site to declare an index signature.
function cellOf<T extends CsvRow>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

/**
 * Consistent table shell for analytics dashboards — header row, zebra
 * rows, and a one-click CSV download built from the same `columns` array
 * the table itself renders.
 *
 * Intentionally a Server Component so server-constructed pages can pass
 * `format` / `render` function props without hitting the RSC boundary.
 * The CSV download (which needs `document` and an `onClick`) lives in a
 * tiny client child, `ExportButton`, that only receives the pre-built
 * CSV string.
 */
export default function AnalyticsTable<T extends CsvRow>({
  title,
  caption,
  rows,
  columns,
  render,
  exportSlug,
  exportRange,
  emptyHint,
  numericKeys = [],
}: Props<T>) {
  const numSet = new Set(numericKeys);
  const csv = toCsv(columns, rows);
  const filename = buildCsvFilename({
    gymShortName: exportRange.gymShortName,
    report: exportSlug,
    start: exportRange.start,
    end: exportRange.end,
  });

  return (
    <section className="bg-white border border-line rounded-lg overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-line">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink truncate">{title}</h2>
          {caption ? <p className="text-xs text-muted mt-0.5 truncate">{caption}</p> : null}
        </div>
        <ExportButton filename={filename} csv={csv} disabled={rows.length === 0} />
      </header>
      {rows.length === 0 ? (
        <div className="px-4 sm:px-5 py-10 text-center text-sm text-muted">
          {emptyHint ?? "No rows in this period."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper/60">
                {columns.map(col => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-4 sm:px-5 py-2 text-[11px] uppercase tracking-wider text-muted font-semibold ${
                      numSet.has(col.key) ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-line/60 last:border-b-0 hover:bg-paper/40">
                  {columns.map(col => {
                    const raw = cellOf(row, col.key);
                    // `render` can selectively customize a subset of
                    // columns — returning `undefined` (or not handling
                    // the column) falls through to the default format.
                    // Without this fallthrough, unmapped columns render
                    // as empty cells, which is how "Days since last
                    // class" / "Check-ins" / "Check-ins so far" went
                    // blank even though the data was there.
                    const customized = render ? render(col, row) : undefined;
                    const content =
                      customized !== undefined
                        ? customized
                        : col.format
                          ? col.format(raw as T[keyof T & string], row)
                          : raw == null
                            ? ""
                            : String(raw);
                    return (
                      <td
                        key={col.key}
                        className={`px-4 sm:px-5 py-2.5 align-middle ${
                          numSet.has(col.key) ? "text-right tabular-nums" : ""
                        }`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
