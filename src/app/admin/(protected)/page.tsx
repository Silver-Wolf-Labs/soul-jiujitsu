import { createClient } from "@/lib/supabase/server";
import StatsCard from "@/components/admin/StatsCard";
import Link from "next/link";
import ContentHealthWidget from "@/components/admin/ContentHealthWidget";

async function getStats() {
  try {
    const supabase = createClient();
    const [contacts, subscribers, updates, team, blog, settings] = await Promise.all([
      supabase.from("contact_submissions").select("id,read", { count: "exact" }),
      supabase.from("subscribers").select("id", { count: "exact" }),
      supabase.from("updates").select("id", { count: "exact" }),
      supabase.from("team").select("id", { count: "exact" }),
      supabase.from("blog_posts").select("id,published", { count: "exact" }),
      supabase.from("site_settings").select("key,value").in("key", ["alert_enabled"]),
    ]);

    const unreadContacts = (contacts.data ?? []).filter((c: { read: boolean }) => !c.read).length;
    const publishedPosts = (blog.data ?? []).filter((p: { published: boolean }) => p.published).length;
    const alertEnabled = (settings.data ?? []).find((s: { key: string; value: string }) => s.key === "alert_enabled")?.value === "true";

    return {
      unreadContacts,
      subscribers: subscribers.count ?? 0,
      updates: updates.count ?? 0,
      teamMembers: team.count ?? 0,
      publishedPosts,
      alertEnabled,
    };
  } catch {
    return { unreadContacts: 0, subscribers: 0, updates: 0, teamMembers: 0, publishedPosts: 0, alertEnabled: false };
  }
}

export default async function AdminDashboard() {
  const stats = await getStats();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="font-display text-3xl sm:text-4xl text-black mb-1">Dashboard</h1>
      <p className="text-sm text-muted mb-6 sm:mb-8">Welcome back. Here&apos;s what&apos;s happening.</p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8 sm:mb-10">
        <StatsCard label="Unread Contacts" value={stats.unreadContacts} sub="new messages" accent={stats.unreadContacts > 0} href="/admin/contacts" />
        <StatsCard label="Subscribers" value={stats.subscribers} sub="email & SMS" href="/admin/subscribers" />
        <StatsCard label="Team Members" value={stats.teamMembers} sub="coaches & guests" href="/admin/team" />
        <StatsCard label="Updates" value={stats.updates} sub="total posts" href="/admin/updates" />
        <StatsCard label="Blog Posts" value={stats.publishedPosts} sub="published" href="/admin/blog" />
        <StatsCard
          label="Alert Banner"
          value={stats.alertEnabled ? "ON" : "OFF"}
          sub={stats.alertEnabled ? "showing to visitors" : "hidden"}
          href="/admin/settings"
        />
      </div>

      {/* Quick links */}
      <h2 className="font-display text-xl sm:text-2xl text-black mb-3 sm:mb-4">Quick Actions</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Manage Schedule", href: "/admin/schedule", desc: "Add or edit classes" },
          { label: "Post Update", href: "/admin/updates", desc: "News, alerts, events" },
          { label: "Edit Team", href: "/admin/team", desc: "Coaches & guests" },
          { label: "Write Blog Post", href: "/admin/blog", desc: "From the mats" },
          { label: "View Contacts", href: "/admin/contacts", desc: `${stats.unreadContacts} unread` },
          { label: "Subscribers", href: "/admin/subscribers", desc: "Export CSV" },
          { label: "Alert Banner", href: "/admin/settings", desc: "Toggle & edit text" },
          { label: "View Site", href: "/", desc: "Open public site" },
        ].map(({ label, href, desc }) => (
          <Link
            key={href}
            href={href}
            className="bg-white border border-line rounded-lg p-3 sm:p-4 hover:border-black hover:shadow-sm transition-all group"
          >
            <div className="text-sm font-semibold text-ink group-hover:text-black leading-snug">{label}</div>
            <div className="text-xs text-muted mt-0.5">{desc}</div>
          </Link>
        ))}
      </div>

      {/* Content Health */}
      <h2 className="font-display text-xl sm:text-2xl text-black mb-3 sm:mb-4 mt-8 sm:mt-10">Content Health</h2>
      <ContentHealthWidget />
    </div>
  );
}
