"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveSetting } from "@/lib/actions/settings-extra";
import AssetBrowser from "@/components/admin/AssetBrowser";
import Spinner from "@/components/ui/Spinner";

const HERO_KEYS = [
  "hero_eyebrow",
  "hero_sub_tagline",
  "hero_stat_left_num",
  "hero_stat_left_label",
  "hero_stat_right_num",
  "hero_stat_right_label",
  "hero_stat_wide_num",
  "hero_stat_wide_label",
] as const;

type HeroSettings = Record<typeof HERO_KEYS[number], string>;

const DEFAULTS: HeroSettings = {
  hero_eyebrow:          "",
  hero_sub_tagline:      "",
  hero_stat_left_num:    "7×",
  hero_stat_left_label:  "Days a Week",
  hero_stat_right_num:   "15+",
  hero_stat_right_label: "Years Open",
  hero_stat_wide_num:    "",
  hero_stat_wide_label:  "Classes offered",
};

export default function AdminHeroPage() {
  const [fields, setFields] = useState<HeroSettings>({ ...DEFAULTS });
  const [heroBgUrl, setHeroBgUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", [...HERO_KEYS, "hero_bg_url"]);
      const rows = (data ?? []) as { key: string; value: string }[];
      const merged = { ...DEFAULTS };
      rows.forEach((r) => {
        if (r.key in merged) merged[r.key as typeof HERO_KEYS[number]] = r.value;
        if (r.key === "hero_bg_url") setHeroBgUrl(r.value);
      });
      setFields(merged);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        ...HERO_KEYS.map((key) => saveSetting(key, fields[key])),
        saveSetting("hero_bg_url", heroBgUrl),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function set(key: typeof HERO_KEYS[number], value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const inputCls = "w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black transition-colors";
  const labelCls = "block text-xs font-semibold text-muted uppercase tracking-wide mb-1";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl text-black mb-1">Hero / Jumbotron</h1>
      <p className="text-sm text-muted mb-8">
        Edit the eyebrow text, tagline, and stat grid shown in the homepage hero section.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <div className="space-y-5">
          {/* Text content */}
          <div className="bg-white border border-line rounded-lg divide-y divide-line">
            <div className="px-4 sm:px-6 py-5">
              <h2 className="font-semibold text-ink mb-4">Text Content</h2>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Eyebrow</label>
                  <input
                    type="text"
                    value={fields.hero_eyebrow}
                    onChange={(e) => set("hero_eyebrow", e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-xs text-muted mt-1">Small line above the headline. Keep it short — shown in all caps.</p>
                </div>
                <div>
                  <label className={labelCls}>Sub-tagline</label>
                  <textarea
                    rows={3}
                    value={fields.hero_sub_tagline}
                    onChange={(e) => set("hero_sub_tagline", e.target.value)}
                    className={`${inputCls} resize-none`}
                  />
                  <p className="text-xs text-muted mt-1">Supporting paragraph below the headline.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="bg-white border border-line rounded-lg divide-y divide-line">
            <div className="px-4 sm:px-6 py-5">
              <h2 className="font-semibold text-ink mb-1">Stat Grid</h2>
              <p className="text-xs text-muted mb-4">The 2×2 stat panel shown to the right of the headline on desktop.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Left stat */}
                <div className="space-y-3 border border-line rounded-lg p-4">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">Top Left (White)</p>
                  <div>
                    <label className={labelCls}>Number</label>
                    <input type="text" value={fields.hero_stat_left_num} onChange={(e) => set("hero_stat_left_num", e.target.value)} className={inputCls} placeholder="7×" />
                  </div>
                  <div>
                    <label className={labelCls}>Label</label>
                    <input type="text" value={fields.hero_stat_left_label} onChange={(e) => set("hero_stat_left_label", e.target.value)} className={inputCls} placeholder="Days a Week" />
                  </div>
                </div>

                {/* Right stat */}
                <div className="space-y-3 border border-black rounded-lg p-4 bg-black">
                  <p className="text-xs font-semibold text-yellow uppercase tracking-wide">Top Right (Black)</p>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-1">Number</label>
                    <input type="text" value={fields.hero_stat_right_num} onChange={(e) => set("hero_stat_right_num", e.target.value)} className="w-full border border-white/20 rounded px-3 py-2 text-sm bg-white/10 text-white focus:outline-none focus:border-yellow" placeholder="15+" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-1">Label</label>
                    <input type="text" value={fields.hero_stat_right_label} onChange={(e) => set("hero_stat_right_label", e.target.value)} className="w-full border border-white/20 rounded px-3 py-2 text-sm bg-white/10 text-white focus:outline-none focus:border-yellow" placeholder="Years Open" />
                  </div>
                </div>
              </div>

              {/* Wide stat */}
              <div className="mt-4 border border-line rounded-lg p-4 bg-off-white">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Bottom Wide (Gray)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Label (left)</label>
                    <input type="text" value={fields.hero_stat_wide_label} onChange={(e) => set("hero_stat_wide_label", e.target.value)} className={inputCls} placeholder="Classes offered" />
                  </div>
                  <div>
                    <label className={labelCls}>Value (right)</label>
                    <input type="text" value={fields.hero_stat_wide_num} onChange={(e) => set("hero_stat_wide_num", e.target.value)} className={inputCls} placeholder="Gi · No-Gi · Open Mat" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Background Image */}
          <div className="bg-white border border-line rounded-lg divide-y divide-line">
            <div className="px-4 sm:px-6 py-5">
              <h2 className="font-semibold text-ink mb-1">Hero Background Image</h2>
              <p className="text-xs text-muted mb-4">Optional background image for the hero section.</p>
              <div>
                <label className={labelCls}>Image URL</label>
                <input
                  type="text"
                  value={heroBgUrl}
                  onChange={(e) => setHeroBgUrl(e.target.value)}
                  placeholder="https://... or select from library below"
                  className={inputCls}
                />
                <div className="mt-3">
                  <p className="text-xs text-muted mb-2">Or pick from media library:</p>
                  <AssetBrowser selectable onSelect={(url) => setHeroBgUrl(url)} />
                </div>
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-black text-white text-sm font-semibold rounded hover:bg-near-black disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : saved ? <span className="inline-flex items-center gap-1">Saved <Check className="w-3.5 h-3.5" /></span> : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
