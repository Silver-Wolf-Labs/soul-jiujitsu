import { createServiceClient } from "@/lib/supabase/service";
import WaiverEditor from "./WaiverEditor";

export default async function WaiverPage() {
  const supabase = createServiceClient();

  const { data: waiver } = await supabase
    .from("waiver_templates")
    .select("id, title, body_md, version, active, created_at")
    .eq("active", true)
    .single();

  // Count signatures on the active waiver
  let signatureCount = 0;
  if (waiver) {
    const { count } = await supabase
      .from("waiver_signatures")
      .select("id", { count: "exact", head: true })
      .eq("template_id", waiver.id);
    signatureCount = count ?? 0;
  }

  // Check if waiver still has placeholders
  const hasPlaceholders = waiver?.body_md
    ? waiver.body_md.includes("[GYM NAME]") || waiver.body_md.includes("[GYM ADDRESS]") || waiver.body_md.includes("[GYM EMAIL]")
    : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display text-white tracking-wider">WAIVER TEMPLATE</h1>
        <p className="text-sm text-white/40 mt-1">
          Edit the legal waiver template. Members sign this when they join.
        </p>
      </div>

      {!waiver ? (
        <div className="rounded-xl border border-yellow/20 bg-yellow/5 px-5 py-4">
          <p className="text-sm text-yellow">
            No active waiver template found. Create one from the Admin &rarr; Waivers page,
            or run the bootstrap migration.
          </p>
        </div>
      ) : (
        <>
          {/* Info bar */}
          <div className="flex items-center gap-6 text-sm text-white/50">
            <span>Version: <strong className="text-white/70">{waiver.version}</strong></span>
            <span>Signatures: <strong className="text-white/70">{signatureCount}</strong></span>
            {hasPlaceholders && (
              <span className="text-yellow">
                Contains unresolved placeholders
              </span>
            )}
          </div>

          {signatureCount > 0 && (
            <div className="rounded-xl border border-yellow/20 bg-yellow/5 px-5 py-3 flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="text-sm text-yellow/80">
                <strong>{signatureCount} members</strong> have signed this waiver version.
                Edits will only affect new signatures — existing signatures remain bound
                to the version they signed.
              </div>
            </div>
          )}

          <WaiverEditor
            templateId={waiver.id}
            initialTitle={waiver.title}
            initialBody={waiver.body_md}
            hasPlaceholders={hasPlaceholders}
          />
        </>
      )}
    </div>
  );
}
