import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGymProfile } from "@/lib/gym-profile";
import { substituteWaiverPlaceholders } from "@/lib/waiver-substitute";
import WaiverSignButton from "./WaiverSignButton";
import WaiverSignOutLink from "./WaiverSignOutLink";

export default async function WaiverPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  // Check if the member has already signed
  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, waiver_signed_at")
    .eq("user_id", user.id)
    .single();

  // Authenticated but no member row — incomplete signup, send them back to /join
  if (!member) {
    redirect("/join");
  }

  if (member.waiver_signed_at) {
    redirect("/portal");
  }

  // Fetch the active waiver template and gym profile
  const [{ data: template }, profile] = await Promise.all([
    supabase
      .from("waiver_templates")
      .select("*")
      .eq("active", true)
      .single(),
    getGymProfile(),
  ]);

  return (
    <div className="min-h-screen bg-off-white py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="font-display text-3xl text-black mb-1">
            {profile.logoText} <span className="text-yellow">{profile.logoDot}</span> {profile.cityName}
          </div>
          <p className="text-sm text-muted">Member Portal</p>
        </div>

        {/* Returning-user context card.
            Without this, a user who started signing up days ago — or worse,
            someone picking up a shared/public computer — lands straight on
            the waiver form with no explanation of why they're here or how
            to get out. The sign-out link is the escape hatch. */}
        <div className="mb-4 bg-white border border-line rounded-lg px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-ink">
              Welcome back, <span className="font-semibold">{member.first_name}</span>.
            </p>
            <p className="text-xs text-muted mt-0.5">
              Your account is ready — just sign the waiver below to finish.
            </p>
          </div>
          <WaiverSignOutLink />
        </div>

        {!template ? (
          <div className="bg-white border border-line rounded-lg p-8 text-center">
            <p className="text-ink">No waiver available. Please contact the gym.</p>
          </div>
        ) : (
          <div className="bg-white border border-line rounded-lg overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-line">
              <h1 className="font-display text-2xl text-black">{template.title}</h1>
              <p className="text-xs text-muted mt-1">Version {template.version} &mdash; Please read the full document below before signing.</p>
            </div>

            {/* WaiverSignButton owns the scrollable body so the agreement
                checkbox can gate on scroll position. The body markdown is
                still server-rendered and passed as children. */}
            <WaiverSignButton
              templateId={template.id}
              firstName={member.first_name}
              lastName={member.last_name}
            >
              <WaiverBody bodyMd={substituteWaiverPlaceholders(template.body_md, profile)} />
            </WaiverSignButton>
          </div>
        )}
      </div>
    </div>
  );
}

// Server-side markdown renderer using react-markdown
async function WaiverBody({ bodyMd }: { bodyMd: string }) {
  // Dynamically import to keep this as a server component
  const ReactMarkdown = (await import("react-markdown")).default;
  return <ReactMarkdown>{bodyMd}</ReactMarkdown>;
}
