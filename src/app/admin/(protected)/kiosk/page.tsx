"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveSetting } from "@/lib/actions/settings-extra";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import {
  parseUnlockGrace,
  UNLOCK_GRACE_VALUES,
  type KioskUnlockGrace,
} from "@/lib/kiosk-ui-config";
import Spinner from "@/components/ui/Spinner";

// Labels + help text for the unlock-grace radio group. Same "[verb] the PIN
// [condition]" shape for every row so scanning down is quick.
const GRACE_OPTIONS: Record<KioskUnlockGrace, { label: string; hint: string }> = {
  strict: {
    label: "Strict",
    hint: "Require the PIN on every refresh.",
  },
  "4h": {
    label: "4 hours",
    hint: "Skip the PIN for up to 4 hours after unlock.",
  },
  "8h": {
    label: "8 hours",
    hint: "Skip the PIN for up to 8 hours after unlock.",
  },
  "16h": {
    label: "16 hours",
    hint: "Skip the PIN for up to 16 hours after unlock.",
  },
};

// Dedicated Kiosk admin page. Holds everything that controls the front-desk
// check-in tablet at /kiosk: the unlock PIN, which member statuses may check
// themselves in, and whether an admin must be signed in to unlock.
//
// This moved out of the generic /admin/settings page so the kiosk surface
// stays self-contained. Settings still links here as a breadcrumb.

const ALL_STATUSES = ["active", "trial", "prospect"] as const;
type MemberStatus = typeof ALL_STATUSES[number];

export default function AdminKioskPage() {
  const [kioskPin, setKioskPin] = useState("");
  const [pinRevealed, setPinRevealed] = useState(false);
  const [kioskStatuses, setKioskStatuses] = useState<MemberStatus[]>(["active"]);
  const [requireAdmin, setRequireAdmin] = useState(true);
  const [pinPrivacyMask, setPinPrivacyMask] = useState(true);
  const [unlockGrace, setUnlockGrace] = useState<KioskUnlockGrace>("4h");
  const [logoutOnUnlock, setLogoutOnUnlock] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", [
          SETTINGS_KEYS.KIOSK_PIN,
          SETTINGS_KEYS.KIOSK_ALLOWED_STATUSES,
          SETTINGS_KEYS.KIOSK_REQUIRE_ADMIN,
          SETTINGS_KEYS.KIOSK_PIN_PRIVACY_MASK,
          SETTINGS_KEYS.KIOSK_UNLOCK_GRACE,
          SETTINGS_KEYS.KIOSK_LOGOUT_ADMIN_ON_UNLOCK,
        ]);
      const rows = (data ?? []) as { key: string; value: string }[];
      const get = (k: string) => rows.find(r => r.key === k)?.value ?? "";
      setKioskPin(get(SETTINGS_KEYS.KIOSK_PIN));
      const raw = get(SETTINGS_KEYS.KIOSK_ALLOWED_STATUSES) || "active";
      setKioskStatuses(raw.split(",").map(s => s.trim()).filter(Boolean) as MemberStatus[]);
      // Default true — the row only exists if the migration has run or an
      // admin has explicitly set it. Either way, absence == secure default.
      const requireRaw = get(SETTINGS_KEYS.KIOSK_REQUIRE_ADMIN);
      setRequireAdmin(requireRaw === "" ? true : requireRaw.toLowerCase() !== "false");
      // Privacy mask also defaults true (secure) — only explicit "false" disables.
      const maskRaw = get(SETTINGS_KEYS.KIOSK_PIN_PRIVACY_MASK);
      setPinPrivacyMask(maskRaw === "" ? true : maskRaw.toLowerCase() !== "false");
      // Unlock grace: narrow to the enum, fallback to the library default.
      setUnlockGrace(parseUnlockGrace(get(SETTINGS_KEYS.KIOSK_UNLOCK_GRACE)));
      // Sign-out-on-unlock defaults true (secure) — only explicit "false" disables.
      const logoutRaw = get(SETTINGS_KEYS.KIOSK_LOGOUT_ADMIN_ON_UNLOCK);
      setLogoutOnUnlock(logoutRaw === "" ? true : logoutRaw.toLowerCase() !== "false");
      setLoading(false);
    }
    load();
  }, []);

  function toggleStatus(s: MemberStatus) {
    setKioskStatuses(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [
        saveSetting(SETTINGS_KEYS.KIOSK_ALLOWED_STATUSES, kioskStatuses.join(",")),
        saveSetting(SETTINGS_KEYS.KIOSK_REQUIRE_ADMIN, requireAdmin ? "true" : "false"),
        saveSetting(SETTINGS_KEYS.KIOSK_PIN_PRIVACY_MASK, pinPrivacyMask ? "true" : "false"),
        saveSetting(SETTINGS_KEYS.KIOSK_UNLOCK_GRACE, unlockGrace),
        saveSetting(SETTINGS_KEYS.KIOSK_LOGOUT_ADMIN_ON_UNLOCK, logoutOnUnlock ? "true" : "false"),
      ];
      // Only write the PIN if the admin typed something — otherwise keep the
      // existing value so "Save" doesn't silently clear the PIN.
      if (kioskPin.trim()) {
        tasks.push(saveSetting(SETTINGS_KEYS.KIOSK_PIN, kioskPin.trim()));
      }
      await Promise.all(tasks);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl">
      <h1 className="font-display text-3xl sm:text-4xl text-black mb-1">Kiosk</h1>
      <p className="text-sm text-muted mb-8">
        Front-desk iPad at <span className="font-mono">/kiosk</span> — PIN, access policy, and who can self-check-in.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <div className="bg-white border border-line rounded-lg divide-y divide-line">
          {/* Access */}
          <div className="px-4 sm:px-6 py-5">
            <h2 className="font-semibold text-ink mb-1">Access</h2>
            <p className="text-xs text-muted mb-4">
              How the kiosk is unlocked at the start of a shift.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  Kiosk PIN
                </label>
                <div className="relative w-40">
                  <input
                    type={pinRevealed ? "text" : "password"}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={8}
                    value={kioskPin}
                    onChange={e => setKioskPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="4-digit PIN"
                    className="w-full border border-line rounded px-3 py-2 pr-9 text-sm font-mono tracking-widest focus:outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    onClick={() => setPinRevealed(v => !v)}
                    aria-label={pinRevealed ? "Hide PIN" : "Show PIN"}
                    aria-pressed={pinRevealed}
                    className="absolute inset-y-0 right-0 w-9 flex items-center justify-center text-muted hover:text-ink transition-colors"
                  >
                    {pinRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted mt-1">Leave blank to keep current PIN.</p>
              </div>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requireAdmin}
                  onChange={e => setRequireAdmin(e.target.checked)}
                  className="accent-black mt-0.5"
                />
                <span>
                  <span className="text-sm text-ink font-medium">Require admin logged in to open kiosk</span>
                  <span className="block text-xs text-muted mt-0.5">
                    Recommended — prevents anyone with the PIN from unlocking the tablet if staff aren&apos;t present.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={logoutOnUnlock}
                  onChange={e => setLogoutOnUnlock(e.target.checked)}
                  className="accent-black mt-0.5"
                />
                <span>
                  <span className="text-sm text-ink font-medium">Sign out admin after unlock</span>
                  <span className="block text-xs text-muted mt-0.5">
                    Recommended — clears the admin session on this device the moment the kiosk goes live, so staff or unauthorized users can&apos;t reach <span className="font-mono">/admin</span> from the tablet. While the kiosk is active, <span className="font-mono">/admin</span> is blocked from this device regardless of this setting.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Privacy */}
          <div className="px-4 sm:px-6 py-5">
            <h2 className="font-semibold text-ink mb-1">Privacy</h2>
            <p className="text-xs text-muted mb-4">
              How typed PIN digits appear on the kiosk screen.
            </p>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pinPrivacyMask}
                onChange={e => setPinPrivacyMask(e.target.checked)}
                className="accent-black mt-0.5"
              />
              <span>
                <span className="text-sm text-ink font-medium">Mask PIN digits while typing</span>
                <span className="block text-xs text-muted mt-0.5">
                  Each digit briefly appears, then hides behind a filled circle so bystanders can&apos;t shoulder-surf. Applies to both the unlock pad and the member check-in pad.
                </span>
              </span>
            </label>
          </div>

          {/* Persistence */}
          <div className="px-4 sm:px-6 py-5">
            <h2 className="font-semibold text-ink mb-1">Persistence</h2>
            <p className="text-xs text-muted mb-4">
              How long the kiosk stays open after an unlock without re-entering the PIN.
              A policy change here takes effect on the next unlock &mdash; active sessions
              are not interrupted.
            </p>
            <div className="space-y-2.5">
              {UNLOCK_GRACE_VALUES.map(v => {
                const opt = GRACE_OPTIONS[v];
                const selected = unlockGrace === v;
                return (
                  <label
                    key={v}
                    className={`flex items-start gap-3 cursor-pointer select-none rounded border px-3 py-2.5 transition-colors ${
                      selected ? "border-black bg-paper" : "border-line hover:border-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="unlock-grace"
                      value={v}
                      checked={selected}
                      onChange={() => setUnlockGrace(v)}
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

          {/* Member access */}
          <div className="px-4 sm:px-6 py-5">
            <h2 className="font-semibold text-ink mb-1">Who can check in</h2>
            <p className="text-xs text-muted mb-3">
              Members with these statuses can look themselves up on the kiosk.
            </p>
            <div className="flex gap-3 flex-wrap">
              {ALL_STATUSES.map(s => (
                <label key={s} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={kioskStatuses.includes(s)}
                    onChange={() => toggleStatus(s)}
                    className="accent-black"
                  />
                  <span className="text-sm capitalize text-ink">{s}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            {error ? <p className="text-xs text-danger">{error}</p> : <span />}
            <button
              onClick={handleSave}
              disabled={saving || kioskStatuses.length === 0}
              className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : saved ? <span className="inline-flex items-center gap-1">Saved <Check className="w-3.5 h-3.5" /></span> : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
