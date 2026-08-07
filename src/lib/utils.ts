import { BeltColor, BELT_COLOR_MAP } from "./constants";

// ── Date formatting ────────────────────────────────────────────────────────

/**
 * Format a date string or Date object for display.
 * e.g. "2026-03-26" → "26 mar 2026"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-CR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Format a date string or Date object with time to the second.
 * e.g. "2026-03-26T14:30:05Z" → "26 mar 2026, 2:30:05 p. m."
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("es-CR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format a date with day of week.
 * e.g. "2026-03-26" → "jue, 26 mar 2026"
 */
export function formatDateLong(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-CR", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Estimate read time from body text.
 * Returns e.g. "5 min de lectura"
 */
export function estimateReadTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min de lectura`;
}

/**
 * Format a date string with the gym's timezone.
 * e.g. "26 mar 2026" — date only, in the specified timezone.
 */
export function formatDateTz(date: string | Date, timeZone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-CR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

/**
 * Format a date+time string with the gym's timezone and abbreviation.
 * e.g. "26 mar 2026, 3:42 p. m. GMT-6"
 */
export function formatDateTimeTz(date: string | Date, timeZone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("es-CR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

/**
 * Format a time string with timezone abbreviation.
 * e.g. "3:42 p. m. GMT-6"
 */
export function formatTimeTz(date: string | Date, timeZone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("es-CR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

// ── Slug generation ────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a string.
 * e.g. "Rob Ables" → "rob-ables"
 */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ── Avatar initials ────────────────────────────────────────────────────────

/**
 * Extract initials from a full name.
 * e.g. "Rob Ables" → "RA", "Sara A." → "SA"
 */
export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Belt color ─────────────────────────────────────────────────────────────

/**
 * Get hex color for a belt level string.
 */
export function getBeltColor(belt: string): string {
  const key = belt.toLowerCase() as BeltColor;
  return BELT_COLOR_MAP[key] ?? BELT_COLOR_MAP[BeltColor.White];
}

// ── Today detection ────────────────────────────────────────────────────────

/**
 * Get the current day name matching the schedule's day format.
 * e.g. "Monday", "Tuesday", ...
 */
export function getTodayName(): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date().getDay()
  ];
}

// ── Currency formatting ────────────────────────────────────────────────────

/** Format cents as a dollar string. e.g. 1999 → "$19.99" */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── CSV export ─────────────────────────────────────────────────────────────

/**
 * Convert an array of objects to a CSV string.
 */
export function toCSV<T extends Record<string, unknown>>(rows: T[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? "").replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
