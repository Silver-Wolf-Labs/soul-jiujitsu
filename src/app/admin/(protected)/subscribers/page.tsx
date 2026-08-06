"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLong } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/utils";
import type { Subscriber } from "@/lib/supabase/types";
import Spinner from "@/components/ui/Spinner";

export default function AdminSubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "email" | "sms">("all");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("subscribers")
        .select("*")
        .order("created_at", { ascending: false });
      setSubscribers((data as Subscriber[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const displayed = filter === "all" ? subscribers : subscribers.filter((s) => s.mode === filter);
  const emailCount = subscribers.filter((s) => s.mode === "email").length;
  const smsCount = subscribers.filter((s) => s.mode === "sms").length;

  function handleExport() {
    const rows = displayed.map((s) => ({
      Value: s.value,
      Type: s.mode,
      Subscribed: formatDateLong(s.created_at),
    }));
    downloadCSV(`subscribers-${filter}-${Date.now()}.csv`, toCSV(rows));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-black">Subscribers</h1>
          <p className="text-sm text-muted mt-0.5">
            {emailCount} email · {smsCount} SMS
          </p>
        </div>
        <button
          onClick={handleExport}
          className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "email", "sms"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors capitalize ${
              filter === f
                ? "bg-black text-white border-black"
                : "bg-white text-ink border-line hover:border-black"
            }`}
          >
            {f === "all" ? `All (${subscribers.length})` : f === "email" ? `Email (${emailCount})` : `SMS (${smsCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {displayed.map((s) => (
              <div key={s.id} className="bg-white border border-line rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-mono text-sm text-ink min-w-0 truncate">{s.value}</div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${
                      s.mode === "email"
                        ? "bg-blue-light text-blue"
                        : "bg-purple-light text-purple"
                    }`}
                  >
                    {s.mode}
                  </span>
                </div>
                <div className="text-xs text-muted mt-2">{formatDateLong(s.created_at)}</div>
              </div>
            ))}
            {displayed.length === 0 && (
              <p className="text-center text-muted text-sm py-8">No subscribers yet.</p>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block bg-white border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-off-white text-xs text-muted uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Value</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((s, i) => (
                  <tr key={s.id} className={`border-b border-line last:border-0 ${i % 2 === 1 ? "bg-off-white/40" : ""}`}>
                    <td className="px-4 py-3 text-ink font-mono text-sm">{s.value}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          s.mode === "email"
                            ? "bg-blue-light text-blue"
                            : "bg-purple-light text-purple"
                        }`}
                      >
                        {s.mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDateLong(s.created_at)}</td>
                  </tr>
                ))}
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted text-sm">
                      No subscribers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
