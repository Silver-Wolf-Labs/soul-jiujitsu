"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Member, MemberStatus } from "@/lib/supabase/types";
import Spinner from "@/components/ui/Spinner";
import Pagination from "@/components/admin/Pagination";
import SortableHeader from "@/components/admin/SortableHeader";

const STATUS_STYLES: Record<MemberStatus, string> = {
  active:    "bg-success-light text-success border-success-border",
  trial:     "bg-blue-light text-blue border-line",
  prospect:  "bg-yellow-light text-yellow-dark border-yellow-border",
  inactive:  "bg-disabled-light text-muted border-line",
  suspended: "bg-danger-light text-danger border-danger-border",
};

const TABS: { label: string; value: MemberStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Trial", value: "trial" },
  { label: "Prospect", value: "prospect" },
  { label: "Inactive", value: "inactive" },
  { label: "Suspended", value: "suspended" },
];

type MemberRow = Member & { plan_name?: string | null };

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<MemberStatus | "all">("all");
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [waiverFilter, setWaiverFilter] = useState<"all" | "signed" | "unsigned">("all");
  const PAGE_SIZE = 25;

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("members")
      .select(`*, member_memberships(status, membership_plans(name))`)
      .order("created_at", { ascending: false });

    const rows = (data ?? []).map((m: Record<string, unknown>) => {
      const memberships = (m.member_memberships as Array<{ status: string; membership_plans: { name: string } | null }> | null) ?? [];
      const active = memberships.find(mb => mb.status === "active" || mb.status === "trialing");
      return { ...m, plan_name: active?.membership_plans?.name ?? null } as MemberRow;
    });
    setMembers(rows);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => { setPage(1); }, [search, tab, sortKey, sortDir, waiverFilter]);

  const filtered = members.filter(m => {
    const matchTab = tab === "all" || m.status === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || `${m.first_name} ${m.last_name} ${m.email} ${m.phone ?? ""}`.toLowerCase().includes(q);
    const matchWaiver = waiverFilter === "all" ||
      (waiverFilter === "signed" ? !!m.waiver_signed_at : !m.waiver_signed_at);
    return matchTab && matchSearch && matchWaiver;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal: unknown = a[sortKey as keyof MemberRow];
    let bVal: unknown = b[sortKey as keyof MemberRow];
    // Handle nested name sort
    if (sortKey === "name") {
      aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
      bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
    }
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-black">Members</h1>
          <p className="text-sm text-muted mt-0.5">{members.length} total · {sorted.length} shown</p>
        </div>
        <button
          onClick={() => router.push("/admin/members/new")}
          className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors"
        >
          + Add Member
        </button>
      </div>

      {/* Search + Waiver filter */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-full sm:max-w-sm border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
        />
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted mr-1">Waiver:</span>
          {(["all", "signed", "unsigned"] as const).map(v => (
            <button
              key={v}
              onClick={() => setWaiverFilter(v)}
              className={`px-2.5 py-1 rounded border transition-colors capitalize ${
                waiverFilter === v
                  ? "border-black bg-black text-white"
                  : "border-line text-muted hover:border-black"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-line overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab === t.value ? "border-black text-black" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.value !== "all" && (
              <span className="ml-1.5 text-xs text-muted">
                {members.filter(m => m.status === t.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <>
        {/* Mobile card view */}
        <div className="space-y-3 md:hidden">
          {paginated.map(m => (
            <div key={m.id} className="bg-white border border-line rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink">{m.first_name} {m.last_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border capitalize ${STATUS_STYLES[m.status]}`}>
                      {m.status}
                    </span>
                    {m.waiver_signed_at ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <span title="Waiver not signed"><AlertTriangle className="w-4 h-4 text-yellow" /></span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1 truncate">{m.email}</p>
                </div>
                <button
                  onClick={() => router.push(`/admin/members/${m.id}`)}
                  className="text-xs px-3 py-1.5 rounded border border-line hover:border-black transition-colors shrink-0"
                >
                  View
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-muted text-sm">No members found.</p>
          )}
        </div>

        {/* Desktop table view */}
        <div className="bg-white border border-line rounded-lg overflow-hidden hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-off-white text-xs text-muted uppercase tracking-wide">
                <SortableHeader label="Name" sortKey="name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Email" sortKey="email" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Phone" sortKey="phone" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} className="hidden lg:table-cell" />
                <SortableHeader label="Status" sortKey="status" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} />
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Waiver</th>
                <SortableHeader label="Joined" sortKey="created_at" currentSortKey={sortKey} currentSortDir={sortDir} onSort={toggleSort} className="hidden lg:table-cell" />
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((m, i) => (
                <tr
                  key={m.id}
                  className={`border-b border-line last:border-0 hover:bg-off-white/60 cursor-pointer ${i % 2 === 1 ? "bg-off-white/40" : ""}`}
                  onClick={() => router.push(`/admin/members/${m.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{m.first_name} {m.last_name}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{m.email}</td>
                  <td className="px-4 py-3 text-muted hidden lg:table-cell">{m.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded border capitalize ${STATUS_STYLES[m.status]}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{m.plan_name ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {m.waiver_signed_at ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <span title="Waiver not signed"><AlertTriangle className="w-4 h-4 text-yellow" /></span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted hidden lg:table-cell text-xs">{formatDate(m.created_at)}</td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => router.push(`/admin/members/${m.id}`)}
                      className="text-xs text-blue-mid hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted text-sm">No members found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={sorted.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
        </>
      )}
    </div>
  );
}
