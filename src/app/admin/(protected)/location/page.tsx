"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveLocationSettings } from "@/lib/actions/location";
import Spinner from "@/components/ui/Spinner";

interface HourRow { days: string; hours: string; }

const DEFAULT_HOURS: HourRow[] = [
  { days: "Mon–Fri", hours: "6am – 8:30pm" },
  { days: "Sat", hours: "10:30am – 2pm" },
  { days: "Sun", hours: "12pm – 1:30pm" },
];

export default function AdminLocationPage() {
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState<HourRow[]>(DEFAULT_HOURS);
  const [mapEmbed, setMapEmbed] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", [
          "contact_address", "contact_city", "contact_state", "contact_zip",
          "contact_phone", "contact_email", "contact_hours", "contact_map_embed",
        ]);
      const rows = (data ?? []) as { key: string; value: string }[];
      const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
      setAddress(get("contact_address"));
      setCity(get("contact_city"));
      setState(get("contact_state"));
      setZip(get("contact_zip"));
      setPhone(get("contact_phone"));
      setEmail(get("contact_email"));
      setMapEmbed(get("contact_map_embed"));
      const h = get("contact_hours");
      if (h) {
        try { setHours(JSON.parse(h)); } catch { /* keep default */ }
      }
      setLoading(false);
    }
    load();
  }, []);

  function updateHour(idx: number, field: keyof HourRow, value: string) {
    setHours((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  }

  function addHourRow() {
    setHours((prev) => [...prev, { days: "", hours: "" }]);
  }

  function removeHourRow(idx: number) {
    setHours((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveLocationSettings({ address, city, state, zip, phone, email, hours, mapEmbed });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black";
  const labelCls = "block text-xs font-semibold text-muted uppercase tracking-wide mb-1";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl text-black mb-1">Location & Contact</h1>
      <p className="text-sm text-muted mb-8">Configure the address, phone, email, hours, and map shown on the public site.</p>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <div className="space-y-6">
          {/* Address */}
          <div className="bg-white border border-line rounded-lg px-4 sm:px-6 py-5 space-y-4">
            <h2 className="font-semibold text-ink">Address</h2>
            <div>
              <label className={labelCls}>Street Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="123 Main St, Suite 100" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <label className={labelCls}>City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="City" />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <input value={state} onChange={(e) => setState(e.target.value)} className={inputCls} placeholder="TX" maxLength={2} />
              </div>
              <div>
                <label className={labelCls}>Zip</label>
                <input value={zip} onChange={(e) => setZip(e.target.value)} className={inputCls} placeholder="12345" />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white border border-line rounded-lg px-4 sm:px-6 py-5 space-y-4">
            <h2 className="font-semibold text-ink">Contact</h2>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="(555) 123-4567" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="info@yourgym.com" />
            </div>
          </div>

          {/* Hours */}
          <div className="bg-white border border-line rounded-lg px-4 sm:px-6 py-5">
            <h2 className="font-semibold text-ink mb-4">Hours of Operation</h2>
            <div className="space-y-2 mb-3">
              {hours.map((row, idx) => (
                <div key={idx} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                  <input
                    value={row.days}
                    onChange={(e) => updateHour(idx, "days", e.target.value)}
                    placeholder="Mon–Fri"
                    className="border border-line rounded px-3 py-1.5 text-sm focus:outline-none focus:border-black w-full sm:w-36 flex-shrink-0"
                  />
                  <input
                    value={row.hours}
                    onChange={(e) => updateHour(idx, "hours", e.target.value)}
                    placeholder="6am – 8:30pm"
                    className="border border-line rounded px-3 py-1.5 text-sm focus:outline-none focus:border-black flex-1"
                  />
                  <button
                    onClick={() => removeHourRow(idx)}
                    className="w-8 h-8 flex items-center justify-center text-muted hover:text-danger text-sm flex-shrink-0"
                    title="Remove row"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addHourRow}
              className="text-xs text-blue-mid hover:underline"
            >
              + Add row
            </button>
          </div>

          {/* Map embed */}
          <div className="bg-white border border-line rounded-lg px-4 sm:px-6 py-5">
            <h2 className="font-semibold text-ink mb-1">Map Embed URL</h2>
            <p className="text-xs text-muted mb-3">
              From Google Maps: Share → Embed a map → copy the URL from the src attribute.
              Paste the URL only (not the full iframe tag). Adjust center and zoom for desired pin position.
            </p>
            <textarea
              value={mapEmbed}
              onChange={(e) => setMapEmbed(e.target.value)}
              rows={3}
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black font-mono resize-none"
              placeholder="https://maps.google.com/maps?q=..."
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-5 py-2.5 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors font-semibold"
            >
              {saving ? "Saving…" : saved ? <span className="inline-flex items-center gap-1">Saved <Check className="w-3.5 h-3.5" /></span> : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
