"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronUp, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLong } from "@/lib/utils";
import type { ContactSubmission } from "@/lib/supabase/types";
import Spinner from "@/components/ui/Spinner";

export default function AdminContactsPage() {
  const [contacts, setContacts] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("contact_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    setContacts((data as ContactSubmission[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markRead(id: number, read: boolean) {
    const supabase = createClient();
    await supabase.from("contact_submissions").update({ read }).eq("id", id);
    await load();
  }

  const unread = contacts.filter((c) => !c.read).length;
  const displayed =
    filter === "all" ? contacts : contacts.filter((c) => (filter === "unread" ? !c.read : c.read));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-black">Contacts</h1>
          <p className="text-sm text-muted mt-0.5">
            {unread} unread · {contacts.length} total
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        {(["all", "unread", "read"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors capitalize shrink-0 ${
              filter === f
                ? "bg-black text-white border-black"
                : "bg-white text-ink border-line hover:border-black"
            }`}
          >
            {f === "all" ? `All (${contacts.length})` : f === "unread" ? `Unread (${unread})` : `Read (${contacts.length - unread})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <div className="space-y-3">
          {displayed.map((c) => (
            <div
              key={c.id}
              className={`bg-white border rounded-lg overflow-hidden transition-colors ${
                !c.read ? "border-black" : "border-line"
              }`}
            >
              {/* Header row */}
              <div
                className="px-4 sm:px-5 py-4 flex items-start justify-between gap-3 sm:gap-4 cursor-pointer"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {!c.read && (
                    <span className="w-2 h-2 rounded-full bg-black shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {c.first_name} {c.last_name}
                    </p>
                    <p className="text-xs text-muted truncate">{c.email} · {formatDateLong(c.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); markRead(c.id, !c.read); }}
                    className={`text-xs px-3 py-1 rounded border transition-colors hidden sm:inline-block ${
                      c.read
                        ? "border-line text-muted hover:border-black"
                        : "border-black text-black hover:bg-black hover:text-white"
                    }`}
                  >
                    {c.read ? "Mark Unread" : "Mark Read"}
                  </button>
                  <span className="text-muted">{expanded === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
                </div>
              </div>
              {/* Expanded message */}
              {expanded === c.id && (
                <div className="px-4 sm:px-5 pb-4 border-t border-line bg-off-white/60">
                  <p className="text-sm text-ink mt-3 whitespace-pre-wrap leading-relaxed break-words [overflow-wrap:anywhere]">{c.message}</p>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                    <a
                      href={`mailto:${c.email}`}
                      className="text-xs text-blue-mid hover:underline"
                    >
                      Reply to {c.email} <ArrowRight className="inline w-3 h-3 ml-0.5" />
                    </a>
                    <button
                      onClick={() => markRead(c.id, !c.read)}
                      className={`sm:hidden text-xs px-3 py-1.5 rounded border transition-colors ml-auto ${
                        c.read
                          ? "border-line text-muted hover:border-black"
                          : "border-black text-black hover:bg-black hover:text-white"
                      }`}
                    >
                      {c.read ? "Mark Unread" : "Mark Read"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {displayed.length === 0 && (
            <p className="text-muted text-sm text-center py-12">No messages.</p>
          )}
        </div>
      )}
    </div>
  );
}
