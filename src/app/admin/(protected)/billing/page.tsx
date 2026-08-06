"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MembershipStatus } from "@/lib/supabase/types";
import Spinner from "@/components/ui/Spinner";
import Pagination from "@/components/admin/Pagination";
import SortableHeader from "@/components/admin/SortableHeader";

const STATUS_STYLES: Record<MembershipStatus, string> = {
  active:    "bg-success-light text-success border-success-border",
  trialing:  "bg-blue-light text-blue border-line",
  paused:    "bg-yellow-light text-yellow-dark border-yellow-border",
  past_due:  "bg-danger-light text-danger border-danger-border",
  canceled:  "bg-disabled-light text-muted border-line",
};

type BillingRow = {
  id: number;
  member_id: number;
  member_name: string;
  member_email: string;
  plan_name: string;
  plan_billing_interval: string;
  status: MembershipStatus;
  effective_price_cents: number;
  override_price_cents: number | null;
  override_note: string | null;
  started_at: string;
  ends_at: string | null;
};

type FilterTab = "all" | "past_due" | "paused";

const TAB_LABELS: Record<FilterTab, string> = {
  all: "All",
  past_due: "Past Due",
  paused: "Paused",
};

export default function AdminBillingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("started_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("member_memberships")
      .select(`id, member_id, status, effective_price_cents, override_price_cents, override_note, started_at, ends_at, plan_billing_interval,
        members(first_name, last_name, email),
        membership_plans(name)`)
      .neq("status", "canceled")
      .order("created_at", { ascending: false });

    setRows((data ?? []).map((r: Record<string, unknown>) => {
      const m = r.members as { first_name: string; last_name: string; email: string } | null;
      const p = r.membership_plans as { name: string } | null;
      return {
        id: r.id as number,
        member_id: r.member_id as number,
        member_name: m ? `${m.first_name} ${m.last_name}` : "Unknown",
        member_email: m?.email ?? "",
        plan_name: p?.name ?? "\u2014",
        plan_billing_interval: (r.plan_billing_interval as string) ?? "month",
        status: r.status as MembershipStatus,
        effective_price_cents: r.effective_price_cents as number,
        override_price_cents: r.override_price_cents as number | null,
        override_note: r.override_note as string | null,
        started_at: r.started_at as string,
        ends_at: r.ends_at as string | null,
      };
    }));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const pastDue = rows.filter(r => r.status === "past_due");
  const paused  = rows.filter(r => r.status === "paused");

  const filtered =
    tab === "past_due"     ? pastDue :
    tab === "paused"       ? paused :
    rows;

  const searched = filtered.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.member_name.toLowerCase().includes(q) || r.member_email.toLowerCase().includes(q);
  });

  const sorted = [...searched].sort((a, b) => {
    const aVal = a[sortKey as keyof BillingRow];
    const bVal = b[sortKey as keyof BillingRow];
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, tab, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function effectivePrice(row: BillingRow) {
    return `$${(row.effective_price_cents / 100).toFixed(0)}`;
  }

  function cardClass(active: boolean, highlight = "") {
    return `border rounded-lg p-4 text-left transition-all hover:shadow-sm cursor-pointer ${highlight} ${
      active ? "ring-2 ring-black/20" : ""
    }`;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl text-black">Billing</h1>
        <p className="text-sm text-muted mt-0.5">Membership billing status across all members.</p>
      </div>

      {/* Exception cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">

        {/* Past Due */}
        <button onClick={() => setTab("past_due")} className={cardClass(tab === "past_due", "border-danger-border bg-danger-light")}>
          <div className="text-2xl font-bold text-danger">{pastDue.length}</div>
          <div className="text-xs text-muted mt-1">Past Due</div>
        </button>

        {/* Paused */}
        <button onClick={() => setTab("paused")} className={cardClass(tab === "paused", "border-yellow-border bg-yellow-light")}>
          <div className="text-2xl font-bold text-yellow-dark">{paused.length}</div>
          <div className="text-xs text-muted mt-1">Paused</div>
        </button>

        {/* Active subscriptions */}
        <div className="border border-success-border rounded-lg p-4 bg-success-light">
          <div className="text-2xl font-bold text-success">{rows.filter(r => r.status === "active").length}</div>
          <div className="text-xs text-muted mt-1">Active</div>
        </div>

        {/* Estimated monthly revenue */}
        <div className="border border-line rounded-lg p-4 bg-white">
          <div className="text-2xl font-bold text-ink">
            ${Math.round(rows.filter(r => r.status === "active").reduce((sum, r) => {
              const monthly = r.plan_billing_interval === "year" ? r.effective_price_cents / 12 : r.effective_price_cents;
              return sum + monthly;
            }, 0) / 100).toLocaleString()}
          </div>
          <div className="text-xs text-muted mt-1">Est. Monthly Revenue</div>
        </div>

      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-line overflow-x-auto">
        {(["all", "past_due", "paused"] as FilterTab[]).map(val => (
          <button
            key={val}
            onClick={() => setTab(val)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors -mb-px ${
              tab === val ? "border-black text-black" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {TAB_LABELS[val]}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by member name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-full sm:max-w-sm border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
        />
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner label="Loading" /></div> : (
        <>
              {/* Mobile card view */}
              <div className="md:hidden space-y-3">
                {paginated.map((row) => (
                  <div
                    key={row.id}
                    onClick={() => router.push(`/admin/members/${row.member_id}`)}
                    className="bg-white border border-line rounded-lg p-4 cursor-pointer hover:bg-yellow-light/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{row.member_name}</div>
                        <div className="text-xs text-muted truncate">{row.member_email}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded border capitalize shrink-0 ${STATUS_STYLES[row.status]}`}>
                        {row.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
                      <div>
                        <span className="text-muted text-xs">Plan</span>
                        <div className="text-muted">{row.plan_name}</div>
                      </div>
                      <div>
                        <span className="text-muted text-xs">Price</span>
                        <div>
                          <span className="font-medium">{effectivePrice(row)}</span>
                          {row.override_price_cents !== null && (
                            <span className="ml-1 text-xs text-yellow-dark border border-yellow-border bg-yellow-light rounded px-1">override</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted text-xs">Started</span>
                        <div className="text-muted text-xs">{new Date(row.started_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                      <span className="text-xs text-blue-mid inline-flex items-center gap-0.5">View <ArrowRight className="w-3 h-3" /></span>
                    </div>
                  </div>
                ))}
                {paginated.length === 0 && (
                  <p className="text-center text-muted text-sm py-8">No records found.</p>
                )}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block bg-white border border-line rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-off-white text-xs text-muted uppercase tracking-wide">
                      <SortableHeader label="Member" sortKey="member_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} />
                      <SortableHeader label="Plan" sortKey="plan_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} />
                      <SortableHeader label="Status" sortKey="status" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} />
                      <SortableHeader label="Price" sortKey="effective_price_cents" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} />
                      <th className="text-left px-4 py-3 hidden lg:table-cell">Payment Method</th>
                      <SortableHeader label="Started" sortKey="started_at" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} className="hidden lg:table-cell" />
                      <th className="text-right px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((row, i) => (
                      <tr
                        key={row.id}
                        onClick={() => router.push(`/admin/members/${row.member_id}`)}
                        className={`border-b border-line last:border-0 cursor-pointer hover:bg-yellow-light/30 transition-colors ${i % 2 === 1 ? "bg-off-white/40" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">{row.member_name}</div>
                          <div className="text-xs text-muted">{row.member_email}</div>
                        </td>
                        <td className="px-4 py-3 text-muted">{row.plan_name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded border capitalize ${STATUS_STYLES[row.status]}`}>
                            {row.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{effectivePrice(row)}</span>
                          {row.override_price_cents !== null && (
                            <span className="ml-1 text-xs text-yellow-dark border border-yellow-border bg-yellow-light rounded px-1">override</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-muted text-xs italic">—</td>
                        <td className="px-4 py-3 hidden lg:table-cell text-muted text-xs">
                          {new Date(row.started_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-blue-mid inline-flex items-center gap-0.5">View <ArrowRight className="w-3 h-3" /></span>
                        </td>
                      </tr>
                    ))}
                    {paginated.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted text-sm">No records found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination page={page} totalPages={totalPages} totalItems={sorted.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
