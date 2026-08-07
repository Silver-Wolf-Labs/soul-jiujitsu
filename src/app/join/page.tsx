import { createClient } from "@/lib/supabase/server";
import { getGymProfile } from "@/lib/gym-profile";
import { substituteWaiverPlaceholders } from "@/lib/waiver-substitute";
import JoinForm, { type ExistingUser } from "./JoinForm";

export default async function JoinPage() {
  const supabase = createClient();

  // Fetch the active waiver template so we can embed it as Step 4 of the signup form.
  // The template is passed as a prop so the client form can render it without an extra fetch.
  //
  // The auth user is resolved HERE rather than in the client form, and that is
  // load-bearing. JoinForm renders two materially different things — a new-account
  // signup vs. "finish the profile for the account you're already signed into" —
  // and the session is what decides which. When the form discovered that itself in
  // a useEffect, it had to hold the entire page behind a spinner until the check
  // resolved, so the server HTML for this public signup page contained no content
  // at all: bad for SEO and perceived performance, and a nightly smoke test caught
  // it (`/join` server-rendered 7 characters of text — the spinner's sr-only label).
  //
  // getUser() rather than getSession(): on the server the session cookie is
  // untrusted input, and getUser() validates it against the auth server. The
  // middleware already refreshes the session on every request, so this is a
  // warm read, not an extra round trip's worth of latency in practice.
  const [{ data: template }, profile, { data: { user } }] = await Promise.all([
    supabase
      .from("waiver_templates")
      .select("id, title, body_md, version")
      .eq("active", true)
      .single(),
    getGymProfile(),
    supabase.auth.getUser(),
  ]);

  // Only the fields the form actually prefills. Names come from the signUp
  // metadata written by the first (incomplete) attempt, so they are best-effort
  // and may legitimately be empty.
  const existingUser: ExistingUser | null = user
    ? {
        id: user.id,
        email: user.email ?? "",
        firstName: (user.user_metadata?.first_name as string | undefined) ?? "",
        lastName: (user.user_metadata?.last_name as string | undefined) ?? "",
      }
    : null;

  // Substitute gym placeholders server-side so the rendered waiver shows real
  // values and the snapshot submitted by the client already contains them.
  // createMemberProfile re-applies substitution server-side as the source of
  // truth, so a tampered client cannot alter the stored snapshot.
  const hydratedTemplate = template
    ? { ...template, body_md: substituteWaiverPlaceholders(template.body_md, profile) }
    : null;

  return <JoinForm waiverTemplate={hydratedTemplate} existingUser={existingUser} />;
}
