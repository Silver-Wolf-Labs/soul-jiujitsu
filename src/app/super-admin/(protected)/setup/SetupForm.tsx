"use client";

import { useState, useTransition } from "react";
import { saveGymSetup, type GymSetupData } from "./actions";
import StatusBanner from "../StatusBanner";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "America/Sao_Paulo", "America/Toronto", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
];

interface Props {
  initial: GymSetupData;
}

export default function SetupForm({ initial }: Props) {
  const [form, setForm] = useState<GymSetupData>(initial);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function set(key: keyof GymSetupData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await saveGymSetup(form);
      if (result.success) {
        setStatus({ type: "success", message: `Saved ${result.count} settings successfully.` });
      } else {
        setStatus({ type: "error", message: result.error });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ── Identity ──────────────────────────────────────────────────── */}
      <Section title="Gym Identity">
        <Row>
          <Input label="Gym Name (legal/full)" value={form.gym_name} onChange={(v) => set("gym_name", v)} placeholder="My Gym Brazilian Jiu-Jitsu" required />
          <Input label="Short Name (2-3 words)" value={form.gym_short_name} onChange={(v) => set("gym_short_name", v)} placeholder="My Gym" />
        </Row>
        <Row>
          <Input label="Logo Text (1-4 chars)" value={form.gym_logo_text} onChange={(v) => set("gym_logo_text", v)} placeholder="MG" maxLength={4} />
          <Input label="Logo Dot Character" value={form.gym_logo_dot} onChange={(v) => set("gym_logo_dot", v)} placeholder="•" maxLength={2} />
        </Row>
        <Row>
          <Input label="City Name" value={form.gym_city_name} onChange={(v) => set("gym_city_name", v)} placeholder="Dallas" required />
          <Select label="Timezone" value={form.gym_timezone} onChange={(v) => set("gym_timezone", v)} options={TIMEZONES} />
        </Row>
        <Input label="Tagline" value={form.gym_tagline} onChange={(v) => set("gym_tagline", v)} placeholder="Train. Improve. Belong." />
        <Input label="Join Button Text" value={form.gym_join_button_text} onChange={(v) => set("gym_join_button_text", v)} placeholder="Join My Gym" />
        <TextArea label="Affiliate / Footer Text" value={form.gym_affiliate_text} onChange={(v) => set("gym_affiliate_text", v)} placeholder="One sentence about the gym." rows={2} />
        <Input label="Footer Tags (comma-separated)" value={form.gym_footer_tags} onChange={(v) => set("gym_footer_tags", v)} placeholder="BJJ, No-Gi, Youth, Dallas TX" />
      </Section>

      {/* ── Contact ──────────────────────────────────────────────────── */}
      <Section title="Contact Information">
        <Input label="Street Address" value={form.contact_address} onChange={(v) => set("contact_address", v)} placeholder="123 Main St, Suite 100" required />
        <Row>
          <Input label="City" value={form.contact_city} onChange={(v) => set("contact_city", v)} placeholder="Dallas" required />
          <Input label="State/Province" value={form.contact_state} onChange={(v) => set("contact_state", v)} placeholder="TX" required />
          <Input label="Postal Code" value={form.contact_zip} onChange={(v) => set("contact_zip", v)} placeholder="12345" required />
        </Row>
        <Row>
          <Input label="Phone" value={form.contact_phone} onChange={(v) => set("contact_phone", v)} placeholder="(214) 555-0100" />
          <Input label="Email" value={form.contact_email} onChange={(v) => set("contact_email", v)} placeholder="info@mygym.com" type="email" required />
        </Row>
      </Section>

      {/* ── Social ───────────────────────────────────────────────────── */}
      <Section title="Social Media">
        <Row>
          <Input label="Instagram URL" value={form.gym_instagram_url} onChange={(v) => set("gym_instagram_url", v)} placeholder="https://instagram.com/mygym" />
          <Input label="Instagram Handle" value={form.gym_instagram_handle} onChange={(v) => set("gym_instagram_handle", v)} placeholder="@mygym" />
        </Row>
      </Section>

      {/* ── SEO / Meta ───────────────────────────────────────────────── */}
      <Section title="SEO / Meta">
        <Input label="Page Title" value={form.gym_meta_title} onChange={(v) => set("gym_meta_title", v)} placeholder="My Gym | Dallas, TX" />
        <TextArea label="Meta Description" value={form.gym_meta_description} onChange={(v) => set("gym_meta_description", v)} placeholder="Train at My Gym in Dallas. Classes for all levels." rows={2} />
        <Input label="Canonical URL" value={form.gym_meta_url} onChange={(v) => set("gym_meta_url", v)} placeholder="https://mygym.com" />
      </Section>

      {/* ── Submit ────────────────────────────────────────────────────── */}
      <StatusBanner status={status} />

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 rounded-lg bg-yellow text-black font-semibold text-sm
                     hover:bg-yellow-light transition-colors disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save All Settings"}
        </button>
        <span className="text-xs text-white/30">
          Changes apply immediately — no deploy needed.
        </span>
      </div>
    </form>
  );
}

// ── Form sub-components ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 md:grid-cols-3">{children}</div>;
}

function Input({
  label, value, onChange, placeholder, required, type = "text", maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string; maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-yellow ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
                   placeholder:text-white/20 focus:outline-none focus:border-yellow/40
                   focus:ring-1 focus:ring-yellow/20 transition-colors"
      />
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
                   focus:outline-none focus:border-yellow/40 focus:ring-1 focus:ring-yellow/20 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-black text-white">{opt}</option>
        ))}
      </select>
    </div>
  );
}

function TextArea({
  label, value, onChange, placeholder, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
                   placeholder:text-white/20 focus:outline-none focus:border-yellow/40
                   focus:ring-1 focus:ring-yellow/20 transition-colors resize-y"
      />
    </div>
  );
}
