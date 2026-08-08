import { getGymProfile } from "@/lib/gym-profile";
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";

/** Check which env vars are set (never expose values). */
function envStatus(): { key: string; set: boolean; hint?: string }[] {
  return [
    { key: "NEXT_PUBLIC_SUPABASE_URL", set: !!process.env.NEXT_PUBLIC_SUPABASE_URL },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    { key: "SUPABASE_SERVICE_ROLE_KEY", set: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    { key: "NEXT_PUBLIC_SITE_URL", set: !!process.env.NEXT_PUBLIC_SITE_URL },
    { key: "SUPER_ADMIN_PASSWORD", set: !!process.env.SUPER_ADMIN_PASSWORD },
  ];
}

/** Quick health check on DB connectivity. */
async function dbHealth(): Promise<{ ok: boolean; settingsCount: number; membersCount: number; waiverActive: boolean }> {
  try {
    const supabase = createServiceClient();
    const [settings, members, waiver] = await Promise.all([
      supabase.from("site_settings").select("key", { count: "exact", head: true }),
      supabase.from("members").select("id", { count: "exact", head: true }),
      supabase.from("waiver_templates").select("id").eq("active", true).single(),
    ]);
    return {
      ok: true,
      settingsCount: settings.count ?? 0,
      membersCount: members.count ?? 0,
      waiverActive: !!waiver.data,
    };
  } catch {
    return { ok: false, settingsCount: 0, membersCount: 0, waiverActive: false };
  }
}

export default async function SuperAdminDashboard() {
  const env = envStatus();
  const [profile, db] = await Promise.all([
    getGymProfile(),
    dbHealth(),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display text-white tracking-wider">PLATFORM DASHBOARD</h1>
        <p className="text-sm text-white/40 mt-1">
          Deployment overview and diagnostics
        </p>
      </div>

      {/* Current Gym Identity */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            Current Gym Identity
          </h2>
          <Link
            href="/super-admin/setup"
            className="text-xs text-yellow hover:text-yellow-light transition-colors"
          >
            Edit &rarr;
          </Link>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-4 text-sm">
          <Field label="Gym Name" value={profile.gymName} />
          <Field label="Short Name" value={profile.shortName} />
          <Field label="Logo Text" value={profile.logoText} />
          <Field label="City" value={profile.cityName} />
          <Field label="Timezone" value={profile.timezone} />
          <Field label="Contact Email" value={profile.contact.email} />
          <Field label="Phone" value={profile.contact.phone} />
          <Field label="Address" value={`${profile.contact.address}, ${profile.contact.city}, ${profile.contact.state} ${profile.contact.zip}`} />
          <Field label="Instagram" value={profile.social.instagramHandle || "Not set"} />
          <Field label="Site URL" value={profile.meta.url} />
        </div>
      </section>

      {/* Environment Variables */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            Environment Variables
          </h2>
        </div>
        <div className="px-5 py-4 space-y-2">
          {env.map((v) => (
            <div key={v.key} className="flex items-center gap-3 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${v.set ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-white/60 font-mono text-xs">{v.key}</span>
              {v.hint && v.set && (
                <span className="text-white/30 text-xs">({v.hint})</span>
              )}
              {!v.set && (
                <span className="text-red-400 text-xs">Missing</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Database Health */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            Database Health
          </h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            db.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}>
            {db.ok ? "Connected" : "Unreachable"}
          </span>
        </div>
        {db.ok && (
          <div className="px-5 py-4 grid grid-cols-3 gap-4">
            <StatCard label="Site Settings" value={db.settingsCount} />
            <StatCard label="Members" value={db.membersCount} />
            <StatCard label="Active Waiver" value={db.waiverActive ? "Yes" : "No"} warn={!db.waiverActive} />
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-2 gap-4">
        <Link
          href="/super-admin/setup"
          className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.02]
                     hover:bg-white/[0.05] hover:border-yellow/20 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-yellow/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-1.065-3.19a2.25 2.25 0 00-1.395-1.395l-3.19-1.065a.375.375 0 010-.71l3.19-1.065a2.25 2.25 0 001.395-1.395l1.065-3.19a.375.375 0 01.71 0l1.065 3.19a2.25 2.25 0 001.395 1.395l3.19 1.065a.375.375 0 010 .71l-3.19 1.065a2.25 2.25 0 00-1.395 1.395l-1.065 3.19a.375.375 0 01-.71 0z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
              Gym Setup
            </div>
            <div className="text-xs text-white/40">Configure identity, contact, SEO</div>
          </div>
        </Link>
        <Link
          href="/super-admin/waiver"
          className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.02]
                     hover:bg-white/[0.05] hover:border-yellow/20 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-yellow/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
              Waiver Template
            </div>
            <div className="text-xs text-white/40">Edit legal waiver text</div>
          </div>
        </Link>
      </section>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-white/30 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-white/70 truncate">{value}</div>
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-display tracking-wider ${warn ? "text-yellow" : "text-white/80"}`}>
        {value}
      </div>
      <div className="text-xs text-white/40 mt-1">{label}</div>
    </div>
  );
}
