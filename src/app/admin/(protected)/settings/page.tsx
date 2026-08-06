"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveSetting } from "@/lib/actions/settings-extra";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import {
  ADMIN_SESSION_TTL_VALUES,
  parseAdminSessionTtl,
  type AdminSessionTtl,
} from "@/lib/admin-session-config";
import Spinner from "@/components/ui/Spinner";

// NOTE: Kiosk settings live on /admin/kiosk. This page is the home for true
// site-wide misc config.

// Same "Require re-auth every X" shape for every row so the options scan
// cleanly in the admin UI.
const TTL_OPTIONS: Record<AdminSessionTtl, { label: string; hint: string }> = {
  "15m": {
    label: "15 minutes",
    hint: "Require re-auth every 15 minutes.",
  },
  "1h": {
    label: "1 hour",
    hint: "Require re-auth every hour.",
  },
  "4h": {
    label: "4 hours",
    hint: "Require re-auth every 4 hours.",
  },
  "8h": {
    label: "8 hours",
    hint: "Require re-auth every 8 hours.",
  },
  "16h": {
    label: "16 hours",
    hint: "Require re-auth every 16 hours.",
  },
};

export default function AdminSettingsPage() {
  const [gymName, setGymName] = useState("");
  const [adminTtl, setAdminTtl] = useState<AdminSessionTtl>("1h");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", [SETTINGS_KEYS.GYM_NAME, SETTINGS_KEYS.ADMIN_SESSION_TTL]);
      const rows = (data ?? []) as { key: string; value: string }[];
      const get = (k: string) => rows.find(r => r.key === k)?.value ?? "";
      setGymName(get(SETTINGS_KEYS.GYM_NAME));
      setAdminTtl(parseAdminSessionTtl(get(SETTINGS_KEYS.ADMIN_SESSION_TTL)));
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        saveSetting(SETTINGS_KEYS.GYM_NAME, gymName),
        saveSetting(SETTINGS_KEYS.ADMIN_SESSION_TTL, adminTtl),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl">
      <h1 className="font-display text-3xl sm:text-4xl text-black mb-1">Settings</h1>
      <p className="text-sm text-muted mb-8">Site-wide configuration.</p>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <div className="bg-white border border-line rounded-lg divide-y divide-line">
          {/* General */}
          <div className="px-4 sm:px-6 py-5">
            <h2 className="font-semibold text-ink mb-1">General</h2>
            <p className="text-xs text-muted mb-4">Basic site information.</p>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Gym Name (override)
              </label>
              <input
                type="text"
                value={gymName}
                onChange={e => setGymName(e.target.value)}
                placeholder="e.g. My Gym Name"
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
              />
              <p className="text-xs text-muted mt-1">Optional — overrides the default from config.ts.</p>
            </div>
          </div>

          {/* Security */}
          <div className="px-4 sm:px-6 py-5">
            <h2 className="font-semibold text-ink mb-1">Security</h2>
            <p className="text-xs text-muted mb-4">
              How long admin sessions stay valid before a forced re-auth.
              Applies to your <em>next</em> sign-in &mdash; the current session
              keeps its original ceiling.
            </p>
            <div className="space-y-2.5">
              {ADMIN_SESSION_TTL_VALUES.map(v => {
                const opt = TTL_OPTIONS[v];
                const selected = adminTtl === v;
                return (
                  <label
                    key={v}
                    className={`flex items-start gap-3 cursor-pointer select-none rounded border px-3 py-2.5 transition-colors ${
                      selected ? "border-black bg-paper" : "border-line hover:border-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="admin-session-ttl"
                      value={v}
                      checked={selected}
                      onChange={() => setAdminTtl(v)}
                      className="accent-black mt-0.5"
                    />
                    <span className="flex-1">
                      <span className="text-sm text-ink font-medium">{opt.label}</span>
                      <span className="block text-xs text-muted mt-0.5">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="px-4 sm:px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors flex-1 sm:flex-none"
            >
              {saving ? "Saving…" : saved ? <span className="inline-flex items-center gap-1">Saved <Check className="w-3.5 h-3.5" /></span> : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
