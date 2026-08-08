import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
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

  // Fetch the active waiver template and gym profile.
  // getTranslations, not useTranslations: this is an async server component and
  // hooks can't run here — same split as portal/page.tsx.
  const [{ data: template }, profile, t] = await Promise.all([
    supabase
      .from("waiver_templates")
      .select("*")
      .eq("active", true)
      .single(),
    getGymProfile(),
    getTranslations("waiver"),
  ]);

  return (
    <div className="min-h-screen bg-off-white py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="font-display text-3xl text-black mb-1">
            {profile.logoText} <span className="text-yellow">{profile.logoDot}</span> {profile.cityName}
          </div>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>

        {/* Returning-user context card.
            Without this, a user who started signing up days ago — or worse,
            someone picking up a shared/public computer — lands straight on
            the waiver form with no explanation of why they're here or how
            to get out. The sign-out link is the escape hatch. */}
        <div className="mb-4 bg-white border border-line rounded-lg px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {/* t.rich, not interpolation: the name keeps its bold span, and in
                Spanish the greeting reads "Hola de nuevo, X" — the placeholder
                sits at a different point in the sentence than in English. */}
            <p className="text-sm text-ink">
              {t.rich("welcomeBack", {
                firstName: member.first_name,
                name: (chunks) => <span className="font-semibold">{chunks}</span>,
              })}
            </p>
            <p className="text-xs text-muted mt-0.5">{t("accountReady")}</p>
          </div>
          <WaiverSignOutLink />
        </div>

        {!template ? (
          <div className="bg-white border border-line rounded-lg p-8 text-center">
            <p className="text-ink">{t("noTemplate")}</p>
          </div>
        ) : (
          <div className="bg-white border border-line rounded-lg overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-line">
              <h1 className="font-display text-2xl text-black">{template.title}</h1>
              {/* The title is admin-authored and renders as stored; only the
                  version line is system copy. */}
              <p className="text-xs text-muted mt-1">{t("versionNote", { version: template.version })}</p>
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
