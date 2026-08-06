import { createClient } from "@/lib/supabase/server";
import { getGymProfile } from "@/lib/gym-profile";
import { substituteWaiverPlaceholders } from "@/lib/waiver-substitute";
import JoinForm from "./JoinForm";

export default async function JoinPage() {
  const supabase = createClient();

  // Fetch the active waiver template so we can embed it as Step 4 of the signup form.
  // The template is passed as a prop so the client form can render it without an extra fetch.
  const [{ data: template }, profile] = await Promise.all([
    supabase
      .from("waiver_templates")
      .select("id, title, body_md, version")
      .eq("active", true)
      .single(),
    getGymProfile(),
  ]);

  // Substitute gym placeholders server-side so the rendered waiver shows real
  // values and the snapshot submitted by the client already contains them.
  // createMemberProfile re-applies substitution server-side as the source of
  // truth, so a tampered client cannot alter the stored snapshot.
  const hydratedTemplate = template
    ? { ...template, body_md: substituteWaiverPlaceholders(template.body_md, profile) }
    : null;

  return <JoinForm waiverTemplate={hydratedTemplate} />;
}
