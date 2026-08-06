"use client";

import { Download } from "lucide-react";
import { downloadCsv } from "@/lib/analytics/csv";

interface Props {
  filename: string;
  csv: string;
  /** Disabled when the underlying dataset is empty. */
  disabled?: boolean;
}

/**
 * One-click CSV download. The parent (a Server Component) builds the CSV
 * string server-side — this client boundary exists solely for the
 * interactive download (onClick + `document` access).
 */
export default function ExportButton({ filename, csv, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, csv)}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink border border-line rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download className="w-3.5 h-3.5" />
      CSV
    </button>
  );
}
