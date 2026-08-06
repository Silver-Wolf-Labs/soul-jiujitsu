"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveSetting } from "@/lib/actions/settings-extra";
import { THEMES } from "@/lib/themes/registry";
import { THEME_ROLES } from "@/lib/themes/roles";
import { generateSlots } from "@/lib/themes/generate";
import { slotsToCustomProperties } from "@/lib/themes/css";
import type { AppTheme } from "@/lib/themes/types";
import type { ThemeRoleColors } from "@/lib/themes/roles";

const ALL_THEMES = Array.from(THEMES.values());
const ROLE_KEYS = THEME_ROLES.map((r) => r.key) as (keyof ThemeRoleColors)[];

const JOURNEY = THEMES.get("journey")!;
const DEFAULT_CUSTOM_ROLES: ThemeRoleColors = { ...JOURNEY.roles };

export default function AdminAppearancePage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Custom theme state
  const [customRoles, setCustomRoles] = useState<ThemeRoleColors>(DEFAULT_CUSTOM_ROLES);
  const [customTone, setCustomTone] = useState<"warm" | "cool" | "neutral">("warm");
  const [customExpanded, setCustomExpanded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["active_theme", "custom_theme_roles", "custom_theme_tone"])
      .then(({ data }) => {
        const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
        setActiveId(map.active_theme ?? "journey");
        if (map.custom_theme_roles) {
          try {
            setCustomRoles(JSON.parse(map.custom_theme_roles));
          } catch { /* keep defaults */ }
        }
        if (map.custom_theme_tone) {
          setCustomTone(map.custom_theme_tone as "warm" | "cool" | "neutral");
        }
      });
  }, []);

  async function selectTheme(themeId: string) {
    setSaving(true);
    await saveSetting("active_theme", themeId);
    setActiveId(themeId);
    setSaving(false);
  }

  // Live preview: apply theme CSS vars to :root temporarily
  const applyPreview = useCallback(
    (roles: ThemeRoleColors, tone: "warm" | "cool" | "neutral") => {
      const slots = generateSlots(roles, tone);
      const css = slotsToCustomProperties(slots);
      let el = document.getElementById("theme-preview-style");
      if (!el) {
        el = document.createElement("style");
        el.id = "theme-preview-style";
        document.head.appendChild(el);
      }
      el.textContent = css;
    },
    [],
  );

  function handleCustomRoleChange(key: keyof ThemeRoleColors, value: string) {
    const next = { ...customRoles, [key]: value };
    setCustomRoles(next);
    if (activeId === "custom") {
      applyPreview(next, customTone);
    }
  }

  function handleCustomToneChange(tone: "warm" | "cool" | "neutral") {
    setCustomTone(tone);
    if (activeId === "custom") {
      applyPreview(customRoles, tone);
    }
  }

  async function saveCustomTheme() {
    setSaving(true);
    await Promise.all([
      saveSetting("custom_theme_roles", JSON.stringify(customRoles)),
      saveSetting("custom_theme_tone", customTone),
      saveSetting("active_theme", "custom"),
    ]);
    setActiveId("custom");
    applyPreview(customRoles, customTone);
    setSaving(false);
  }

  function resetCustomToActive() {
    const theme = THEMES.get(activeId ?? "journey") ?? THEMES.get("journey")!;
    setCustomRoles({ ...theme.roles });
    setCustomTone(theme.tone);
  }

  return (
    <div className="max-w-3xl mx-auto py-6 sm:py-10 px-4 sm:px-6">
      <h1 className="font-display text-3xl mb-1">Appearance</h1>
      <p className="text-muted text-sm mb-8">
        Choose the color theme for the site. Each color has a purpose — hover
        over swatches to see what they control.
      </p>

      {/* ── Role legend ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 text-xs">
        {THEME_ROLES.map((role) => (
          <div key={role.key} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
              style={{ backgroundColor: (THEMES.get(activeId ?? "journey")?.roles ?? DEFAULT_CUSTOM_ROLES)[role.key as keyof ThemeRoleColors] }}
            />
            <span className="text-muted">{role.label}</span>
          </div>
        ))}
      </div>

      {/* ── Preset themes ────────────────────────────────────────────────── */}
      <div className="grid gap-4 mb-6">
        {ALL_THEMES.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            active={activeId === theme.id}
            saving={saving}
            onSelect={() => selectTheme(theme.id)}
          />
        ))}
      </div>

      {/* ── Custom theme ─────────────────────────────────────────────────── */}
      <div
        className={`relative z-20 rounded-lg border-2 transition-colors ${
          activeId === "custom"
            ? "border-yellow bg-yellow-light"
            : "border-line bg-white"
        }`}
      >
        <button
          type="button"
          onClick={() => setCustomExpanded(!customExpanded)}
          className="w-full flex items-center justify-between p-4 sm:p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex gap-2 flex-shrink-0">
              {ROLE_KEYS.map((key) => (
                <span
                  key={key}
                  className="w-7 h-7 rounded-full border border-black/10 flex-shrink-0"
                  style={{ backgroundColor: customRoles[key] }}
                  title={THEME_ROLES.find((r) => r.key === key)?.label}
                />
              ))}
            </div>
            <div className="text-left">
              <div className="font-display text-xl leading-tight">Custom</div>
              <div className="text-muted text-xs mt-0.5">
                Pick your own colors by role
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeId === "custom" && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-yellow text-black">
                Active
              </span>
            )}
            <svg
              className={`w-5 h-5 text-muted transition-transform ${customExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {customExpanded && (
          <div className="px-4 sm:px-5 pb-5 border-t border-line">
            {/* ── Tone selector ───────────────────────────────────────── */}
            <div className="mt-4 mb-5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                Neutral Tone
              </label>
              <div className="flex gap-2">
                {(["warm", "cool", "neutral"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleCustomToneChange(t)}
                    className={`text-xs px-3 py-1.5 rounded border capitalize transition-colors ${
                      customTone === t
                        ? "border-yellow bg-yellow-light font-semibold"
                        : "border-line hover:border-yellow hover:bg-yellow-light"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Color pickers grid ──────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {THEME_ROLES.map((role) => (
                <div key={role.key}>
                  <label className="block text-xs font-semibold mb-1">
                    {role.label}
                  </label>
                  <p className="text-[10px] text-muted leading-tight mb-2">
                    {role.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customRoles[role.key as keyof ThemeRoleColors]}
                      onChange={(e) =>
                        handleCustomRoleChange(
                          role.key as keyof ThemeRoleColors,
                          e.target.value,
                        )
                      }
                      className="w-10 h-10 rounded border border-line cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={customRoles[role.key as keyof ThemeRoleColors]}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                          handleCustomRoleChange(
                            role.key as keyof ThemeRoleColors,
                            v,
                          );
                        }
                      }}
                      className="w-[5.5rem] text-xs font-mono px-2 py-1.5 border border-line rounded bg-white"
                      maxLength={7}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* ── Actions ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={saveCustomTheme}
                disabled={saving}
                className="text-sm font-semibold px-4 py-2 rounded bg-black text-white hover:bg-near-black transition-colors disabled:opacity-40"
              >
                {saving ? "Saving..." : activeId === "custom" ? "Update Custom Theme" : "Activate Custom Theme"}
              </button>
              <button
                type="button"
                onClick={resetCustomToActive}
                className="text-sm px-3 py-2 rounded border border-line hover:border-line-dark transition-colors text-muted"
              >
                Reset
              </button>
              {activeId !== "custom" && (
                <button
                  type="button"
                  onClick={() => applyPreview(customRoles, customTone)}
                  className="text-sm px-3 py-2 rounded border border-line hover:border-yellow hover:bg-yellow-light transition-colors text-muted"
                >
                  Preview
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeCard({
  theme,
  active,
  saving,
  onSelect,
}: {
  theme: AppTheme;
  active: boolean;
  saving: boolean;
  onSelect: () => void;
}) {
  const roleLabels = THEME_ROLES.map((r) => r.label);

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 p-4 sm:p-5 rounded-lg border-2 transition-colors ${
        active ? "border-yellow bg-yellow-light" : "border-line bg-white"
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Swatches — one per role */}
        <div className="flex gap-2 flex-shrink-0">
          {theme.swatches.map((hex, i) => (
            <span
              key={i}
              className="w-7 h-7 rounded-full border border-black/10 flex-shrink-0"
              style={{ backgroundColor: hex }}
              title={roleLabels[i]}
            />
          ))}
        </div>

        {/* Action (mobile) */}
        <div className="sm:hidden ml-auto">
          {active ? (
            <span className="flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-yellow text-black">
              Active
            </span>
          ) : (
            <button
              onClick={onSelect}
              disabled={saving}
              className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded border border-line hover:border-yellow hover:bg-yellow-light transition-colors disabled:opacity-40"
            >
              Select
            </button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-display text-xl leading-tight">{theme.name}</div>
        <div className="text-muted text-xs mt-0.5">{theme.description}</div>
      </div>

      {/* Action (desktop) */}
      <div className="hidden sm:block">
        {active ? (
          <span className="flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-yellow text-black">
            Active
          </span>
        ) : (
          <button
            onClick={onSelect}
            disabled={saving}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded border border-line hover:border-yellow hover:bg-yellow-light transition-colors disabled:opacity-40"
          >
            Select
          </button>
        )}
      </div>
    </div>
  );
}
