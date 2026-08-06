"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, ChevronUp, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuditLog } from "@/lib/supabase/types";
import Spinner from "@/components/ui/Spinner";

function formatAuditDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short", // e.g. "CST", "EST"
  });
}

/** Maps raw DB table names to human-readable labels for the UI. */
const TABLE_LABELS: Record<string, string> = {
  assets:             "Assets",
  audit_logs:         "Audit Logs",
  banners:            "Banners",
  blog_posts:         "Blog Posts",
  check_ins:          "Check-ins",
  faq_items:          "FAQ Items",
  footer_items:       "Footer",
  member_memberships: "Member Memberships",
  member_purchases:   "Member Purchases",
  members:            "Members",
  membership_plans:   "Membership Plans",
  nav_items:          "Navigation",
  pricing_plans:      "Pricing Plans (Legacy)",
  schedule_slots:     "Schedule",
  site_sections:      "Site Sections",
  site_settings:      "Site Settings",
  team:               "Team Members",
  updates:            "Updates Feed",
  waiver_templates:   "Waivers",
};

function tableLabel(raw: string): string {
  return TABLE_LABELS[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

type ActionFilter = "all" | "CREATE" | "UPDATE" | "DELETE" | "TOGGLE";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-success-light text-success",
  UPDATE: "bg-blue-light text-blue",
  DELETE: "bg-danger-light text-danger",
  TOGGLE: "bg-yellow-light text-yellow-dark",
};

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [tables, setTables] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (actionFilter !== "all") query = query.eq("action", actionFilter);
    if (tableFilter !== "all") query = query.eq("table_name", tableFilter);

    const { data, count } = await query;
    setLogs((data as AuditLog[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, actionFilter, tableFilter]);

  // Load distinct table names for filter dropdown
  useEffect(() => {
    async function loadTables() {
      const supabase = createClient();
      const { data } = await supabase
        .from("audit_logs")
        .select("table_name")
        .order("table_name");
      const unique = Array.from(new Set((data ?? []).map((r: { table_name: string }) => r.table_name)));
      setTables(unique);
    }
    loadTables();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [actionFilter, tableFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-black">Audit Log</h1>
          <p className="text-sm text-muted mt-0.5">
            {total.toLocaleString()} event{total !== 1 ? "s" : ""} · 3-year retention
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Action filter */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
          {(["all", "CREATE", "UPDATE", "DELETE", "TOGGLE"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setActionFilter(a)}
              className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors shrink-0 ${
                actionFilter === a
                  ? "bg-black text-white border-black"
                  : "bg-white text-ink border-line hover:border-black"
              }`}
            >
              {a === "all" ? "All Actions" : a}
            </button>
          ))}
        </div>

        {/* Table filter */}
        {tables.length > 0 && (
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded border border-line bg-white text-ink hover:border-black focus:outline-none focus:border-black transition-colors"
          >
            <option value="all">All Tables</option>
            {tables.map((t) => (
              <option key={t} value={t}>{tableLabel(t)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table (desktop) */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-off-white text-xs text-muted uppercase tracking-wide">
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Table</th>
                  <th className="text-left px-4 py-3">Record</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      className={`border-b border-line last:border-0 cursor-pointer hover:bg-off-white/60 transition-colors ${
                        i % 2 === 1 ? "bg-off-white/30" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {formatAuditDate(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${ACTION_COLORS[log.action] ?? "bg-off-white text-ink"}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink">{tableLabel(log.table_name)}</td>
                      <td className="px-4 py-3 text-muted text-xs">{log.record_id ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted truncate max-w-[160px]">
                        {log.user_email ?? <span className="italic">unknown</span>}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {expanded === log.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr key={`${log.id}-payload`} className="border-b border-line bg-off-white/60">
                        <td colSpan={6} className="px-4 pb-4 pt-3">
                          <p className="text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">Payload</p>
                          <pre className="text-xs font-mono text-ink bg-white border border-line rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
                            {Object.keys(log.payload).length === 0
                              ? "(empty)"
                              : JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted text-sm">
                      No audit events found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-white border border-line rounded-lg p-4 cursor-pointer"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${ACTION_COLORS[log.action] ?? "bg-off-white text-ink"}`}>
                        {log.action}
                      </span>
                      <span className="text-xs text-ink truncate">{tableLabel(log.table_name)}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">{formatAuditDate(log.created_at)}</p>
                  </div>
                  <span className="text-muted shrink-0">{expanded === log.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                  <span>Record: {log.record_id ?? "—"}</span>
                  <span className="truncate">{log.user_email ?? <span className="italic">unknown</span>}</span>
                </div>
                {expanded === log.id && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <p className="text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">Payload</p>
                    <pre className="text-xs font-mono text-ink bg-off-white border border-line rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
                      {Object.keys(log.payload).length === 0
                        ? "(empty)"
                        : JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-muted text-sm text-center py-12">No audit events found.</p>
            )}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 gap-3">
          <p className="text-xs text-muted">
            Page {page + 1} of {totalPages} · showing {logs.length} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="text-xs px-3 py-1.5 rounded border border-line bg-white text-ink hover:border-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Prev
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs px-3 py-1.5 rounded border border-line bg-white text-ink hover:border-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ArrowRight className="w-3.5 h-3.5 inline ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
