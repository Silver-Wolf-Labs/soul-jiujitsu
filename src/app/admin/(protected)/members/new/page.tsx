"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createMember } from "@/lib/actions/members";
import type { MemberStatus } from "@/lib/supabase/types";

const emptyForm = {
  first_name: "", last_name: "", email: "", phone: "",
  status: "prospect" as MemberStatus,
  emergency_contact_name: "", emergency_contact_phone: "",
  notes: "", communication_opt_in: true,
};

export default function NewMemberPage() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createMember({
        ...form,
        phone: form.phone || undefined,
        emergency_contact_name: form.emergency_contact_name || undefined,
        emergency_contact_phone: form.emergency_contact_phone || undefined,
        notes: form.notes || undefined,
      });
      router.push("/admin/members");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const f = (field: keyof typeof form) => ({
    value: form[field] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value })),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/admin/members")} className="text-sm text-muted hover:text-black inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />Back</button>
        <h1 className="font-display text-3xl sm:text-4xl text-black">New Member</h1>
      </div>

      {error && <p className="text-sm text-danger mb-4 p-3 bg-danger-light border border-danger-border rounded">{error}</p>}

      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">First Name *</label>
            <input type="text" {...f("first_name")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Last Name *</label>
            <input type="text" {...f("last_name")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Email *</label>
            <input type="email" {...f("email")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Phone</label>
            <input type="tel" {...f("phone")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Status</label>
          <select {...f("status")} className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black">
            <option value="prospect">Prospect</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <hr className="border-line" />
        <h3 className="text-sm font-semibold text-ink">Emergency Contact</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Name</label>
            <input type="text" {...f("emergency_contact_name")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Phone</label>
            <input type="tel" {...f("emergency_contact_phone")} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Notes</label>
          <textarea {...f("notes")} rows={3} className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black resize-none" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.communication_opt_in}
            onChange={e => setForm(prev => ({ ...prev, communication_opt_in: e.target.checked }))}
            className="rounded"
          />
          <span className="text-sm text-ink">Opted in to communications</span>
        </label>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button onClick={() => router.push("/admin/members")} className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving || !form.first_name.trim() || !form.last_name.trim() || !form.email.trim()}
          className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Create Member"}
        </button>
      </div>
    </div>
  );
}
