/**
 * CSP violation report collector.
 *
 * Browsers POST here when the Content-Security-Policy header blocks a
 * resource. The body is a JSON envelope documenting the violation —
 * which directive fired, which URI was blocked, which source file.
 *
 * We log each report via the structured logger so it flows to
 * CloudWatch and feeds the metric filter. This is the data source for
 * the eventual P1 sprint that tightens CSP further (remove
 * 'unsafe-inline', adopt nonce-based policy): we want to know what
 * would break BEFORE we make the change, not after.
 *
 * Rate limiting: not applied here. CSP violations should be low-
 * volume; if we ever get flooded (a broken third-party script firing
 * every page load, for instance), the metric filter's alarm will
 * surface it. If THAT becomes noise, we'll add per-host sampling.
 *
 * Privacy: CSP reports contain the blocked URI and source file name.
 * No PII. Safe to log at `info` level.
 */

import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/log";
import { withRequestContext } from "@/lib/request-id";

// Browsers send CSP reports as `application/csp-report` (older) or
// `application/reports+json` (newer Reporting API). We accept both.
interface LegacyCspReport {
  "csp-report": {
    "document-uri"?: string;
    "referrer"?: string;
    "violated-directive"?: string;
    "effective-directive"?: string;
    "original-policy"?: string;
    "blocked-uri"?: string;
    "status-code"?: number;
    "source-file"?: string;
    "line-number"?: number;
    "column-number"?: number;
  };
}

interface ReportingApiEntry {
  type: string;
  age?: number;
  url?: string;
  body?: {
    documentURL?: string;
    blockedURL?: string;
    effectiveDirective?: string;
    violatedDirective?: string;
    originalPolicy?: string;
    sourceFile?: string;
    sample?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export async function POST(req: NextRequest) {
  return withRequestContext(async () => {
    const contentType = req.headers.get("content-type") ?? "";

    try {
      const raw = await req.text();
      if (!raw) return NextResponse.json({ ok: true }, { status: 204 });

      // Parse either envelope shape. The Reporting API sends an array;
      // legacy `report-uri` sends a single object.
      let normalized: Array<{
        blockedURI?: string;
        violatedDirective?: string;
        sourceFile?: string;
        lineNumber?: number;
        documentURI?: string;
      }> = [];

      if (contentType.includes("application/reports+json")) {
        const entries = JSON.parse(raw) as ReportingApiEntry[];
        normalized = entries
          .filter((e) => e.type === "csp-violation")
          .map((e) => ({
            blockedURI: e.body?.blockedURL,
            violatedDirective: e.body?.effectiveDirective ?? e.body?.violatedDirective,
            sourceFile: e.body?.sourceFile,
            lineNumber: e.body?.lineNumber,
            documentURI: e.body?.documentURL,
          }));
      } else {
        const parsed = JSON.parse(raw) as LegacyCspReport;
        const r = parsed["csp-report"];
        if (r) {
          normalized = [{
            blockedURI: r["blocked-uri"],
            violatedDirective: r["violated-directive"] ?? r["effective-directive"],
            sourceFile: r["source-file"],
            lineNumber: r["line-number"],
            documentURI: r["document-uri"],
          }];
        }
      }

      for (const v of normalized) {
        log.warn("csp violation", {
          blockedURI: v.blockedURI,
          directive: v.violatedDirective,
          sourceFile: v.sourceFile,
          line: v.lineNumber,
          documentURI: v.documentURI,
        });
      }
    } catch (err) {
      log.warn("csp-report: failed to parse body", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // Always 204 — browsers don't consume the response.
    return new NextResponse(null, { status: 204 });
  });
}
