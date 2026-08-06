"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/client";
import { useGymProfile } from "@/lib/gym-profile-context";
import { createMemberProfile } from "@/lib/actions/auth";
import { SpinnerButton } from "@/components/ui/Spinner";
import { BeltColor } from "@/lib/constants";
import BeltEditor, { type BeltEditorValue } from "@/components/ui/BeltEditor";
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from "@/components/signature/SignatureCanvas";
import { SignaturePadModal } from "@/components/signature/SignaturePadModal";

type Belt = BeltColor;

interface WaiverTemplate {
  id: number;
  title: string;
  body_md: string;
  version: number;
}

interface Props {
  waiverTemplate: WaiverTemplate | null;
}

// ── InlineSignaturePad ─────────────────────────────────────────────────────
// Draw-to-sign wrapper used on the signup waiver step. Mirrors the pattern
// in WaiverSignButton: an inline canvas for desktop comfort, plus a "Full
// screen" button that opens SignaturePadModal. The modal requests true
// browser fullscreen + landscape lock on mobile, so signing with a finger
// is actually usable on phones.
//
// Props:
//   onData — called with the PNG data URL whenever the signature changes,
//            or with null on clear. Matches the previous inline component's
//            interface so the parent form didn't need to rewrite its state.
// the "I agree" box.

function InlineSignaturePad({
  onData,
}: {
  onData: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  // Holds a dataURL produced from the fullscreen modal so it survives the
  // return trip to the inline view (where the canvas element is a separate
  // instance and would otherwise be blank).
  const [confirmedDataUrl, setConfirmedDataUrl] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleClear = () => {
    canvasRef.current?.clear();
    setIsEmpty(true);
    setConfirmedDataUrl(null);
    onData(null);
  };

  const handleInlineChange = (empty: boolean) => {
    setIsEmpty(empty);
    if (empty) {
      onData(null);
    } else {
      // Emit the current strokes on every change so the parent's validator
      // clears as soon as the user draws anything.
      onData(canvasRef.current?.toDataURL() ?? null);
    }
  };

  const handleModalConfirm = (dataUrl: string) => {
    setConfirmedDataUrl(dataUrl);
    setShowModal(false);
    setIsEmpty(false);
    onData(dataUrl);
  };

  return (
    <div className="space-y-2">
      {showModal && (
        <SignaturePadModal
          onConfirm={handleModalConfirm}
          onClose={() => setShowModal(false)}
        />
      )}

      {confirmedDataUrl ? (
        // Preview the image captured from the fullscreen pad. Clicking Clear
        // or Full screen again both reset / reopen the surface.
        <div className="relative border-2 border-dashed border-line rounded-lg overflow-hidden bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={confirmedDataUrl}
            alt="Your drawn signature"
            className="w-full h-auto block"
          />
          <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
            <span className="text-xs text-success font-medium bg-white/80 px-1.5 py-0.5 rounded">
              ✓ Signed
            </span>
          </div>
        </div>
      ) : (
        <div className="relative border-2 border-dashed border-line rounded-lg overflow-hidden bg-white">
          <SignatureCanvas
            ref={canvasRef}
            className="w-full h-auto block"
            onChange={handleInlineChange}
          />
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <p className="text-line text-sm">Sign here with your finger or mouse</p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleClear}
          className="text-muted hover:text-ink underline"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1 font-medium text-black border border-line rounded px-2.5 py-1 hover:bg-off-white transition-colors"
        >
          {/* Expand icon — matches WaiverSignButton */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8"
              stroke="currentColor" strokeWidth="1.2"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          Full screen
        </button>
      </div>
      <p className="text-xs text-muted">
        Tip: tap <strong className="font-medium text-ink">Full screen</strong> for
        a bigger signing area &mdash; especially helpful on phones.
      </p>
    </div>
  );
}

export default function JoinForm({ waiverTemplate }: Props) {
  const router = useRouter();
  const profile = useGymProfile();
  // Step 1 = personal info + password, Step 2 = waiver (if exists), Step 3 = training
  // Without waiver: Step 1 = personal info + password, Step 2 = training
  const totalSteps = waiverTemplate ? 3 : 2;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // After a successful submit we flip to a "redirecting" state so the submit
  // button keeps its spinner until the browser navigates away. Without this,
  // loading resets to false the instant `handleSubmit` returns, which causes
  // a visible flash of the default button label before `router.push` lands.
  const [redirecting, setRedirecting] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [hasScrolledWaiver, setHasScrolledWaiver] = useState(false);
  const [waiverSignature, setWaiverSignature] = useState<string | null>(null);
  // Shown on the training step when no waiver template is active, so the
  // skip feels intentional rather than silent.
  const [noWaiverAcknowledged, setNoWaiverAcknowledged] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    emergency_contact_relationship: "",
    communication_opt_in: false,
    birth_month: "",
    birth_year: "",
    gender: "",
    password: "",
    confirm_password: "",
    belt: "white" as Belt,
    stripes: 0,
    belt_awarded_date: "",
    training_started_date: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((prev) => ({
      ...prev,
      [name]: e.target.type === "checkbox" ? checked : value,
    }));
  }

  // Step 1: validate personal info + password, then go to step 2.
  // Async so the HIBP breach check can run without blocking the UI
  // thread; the caller awaits it from the button click handler.
  async function handleNextFromStep1(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!form.password) { setError("Please enter a password."); return; }
    if (form.password !== form.confirm_password) { setError("Passwords do not match."); return; }
    if (form.password.length < 10) {
      setError("Password must be at least 10 characters. Longer passwords are stronger than shorter ones with special characters.");
      return;
    }

    // HIBP breach check. Fails open on HIBP network error so an outage
    // of their service doesn't block signups. See src/lib/auth/hibp.ts.
    try {
      const { validatePassword } = await import("@/lib/actions/password-validation");
      const check = await validatePassword(form.password);
      if (!check.ok) {
        setError(check.message);
        return;
      }
    } catch {
      // If the validation server action itself fails, fall back to just
      // the length check above. Don't block the user on infrastructure.
    }

    setStep(2);
  }

  // Step 2 (waiver): go to step 3 (training)
  function handleNextFromWaiver() {
    setError("");
    if (!waiverAgreed) {
      setError("You must agree to the waiver to continue.");
      return;
    }
    if (!waiverSignature) {
      setError("Please draw your signature above to continue.");
      return;
    }
    setStep(3);
  }

  function handleWaiverScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setHasScrolledWaiver(true);
    }
  }

  async function handleSubmit(skipTraining = false) {
    setLoading(true);
    setError("");

    const supabase = createClient();
    // Use window.location.origin (client-side truth) as the primary source.
    // process.env.NEXT_PUBLIC_SITE_URL is inlined at build time and can
    // become stale or accidentally pin to localhost if the Vercel env
    // differs from the deploy URL — window.location.origin always reflects
    // the actual origin the user is on. We still consult the env var as a
    // fallback in case window is unavailable (it should be, since we're
    // in a "use client" component).
    //
    // NOTE: this only controls the post-confirmation redirect. The link
    // in the email itself is rendered by Supabase using the **Site URL**
    // field in the Auth → URL Configuration dashboard. If emails still
    // point at localhost, the dashboard value is wrong and must be
    // updated to the production URL (and that URL added to the
    // "Redirect URLs" allowlist).
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "";
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        // Pass name in metadata so the handle_new_user() trigger can set
        // profiles.full_name immediately. The RPC also updates it authoritatively,
        // but having it in metadata means it is set even before the RPC runs.
        data: { first_name: form.first_name, last_name: form.last_name },
      },
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    // Supabase's security model: when an email is already registered, signUp
    // returns a "fake" user object with identities: [] instead of an error, so
    // the server can't reveal account existence. Detect it and tell the user
    // to log in — a vague "unable to create account" confuses people who think
    // they filled the form wrong.
    if (!authData.user) {
      setLoading(false);
      setError("Unable to create account. Please try again.");
      return;
    }
    if (authData.user.identities && authData.user.identities.length === 0) {
      setLoading(false);
      setError(
        `An account with ${form.email} already exists. Log in or reset your password instead.`
      );
      return;
    }

    const result = await createMemberProfile({
      userId: authData.user.id,
      password: form.password,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
      emergency_contact_name: form.emergency_contact_name,
      emergency_contact_phone: form.emergency_contact_phone,
      emergency_contact_relationship: form.emergency_contact_relationship,
      communication_opt_in: form.communication_opt_in,
      birth_month: form.birth_month ? Number(form.birth_month) : null,
      birth_year: form.birth_year ? Number(form.birth_year) : null,
      gender: form.gender || null,
      belt: skipTraining ? null : form.belt,
      stripes: skipTraining ? null : form.stripes,
      belt_awarded_at: skipTraining ? null : form.belt_awarded_date || null,
      training_started_at: skipTraining ? null : form.training_started_date || null,
      waiver_template_id: waiverTemplate?.id ?? null,
      waiver_template_version: waiverTemplate?.version ?? null,
      waiver_signature_data_url: waiverSignature,
    });

    if ("error" in result) {
      setLoading(false);
      setError(result.error);
      return;
    }

    // Keep the button in its spinner state until the browser actually
    // navigates. router.push resolves before the destination is rendered,
    // which would otherwise let `loading` flip back to false and flash the
    // default button label for a frame before the new page appears.
    setRedirecting(true);
    const params = new URLSearchParams({ email: form.email });
    router.push(`/join/verify-email?${params}`);
  }

  const labelClass = "block text-xs font-semibold text-muted uppercase tracking-wide mb-1";
  const inputClass = "w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black";
  const btnClass = "w-full py-2.5 bg-black text-white rounded font-semibold text-sm hover:bg-near-black disabled:opacity-50";

  // Responsive container width:
  //   - Mobile: full-width card with ~20rem content
  //   - md+:    widen to 2xl so two-column form doesn't get cramped
  //   - On the waiver step (very content-heavy), bump to 3xl
  const outerMaxWidth = step === 2 && waiverTemplate ? "max-w-3xl" : "max-w-2xl";

  return (
    <div className="min-h-screen bg-off-white flex flex-col items-center justify-start py-16 px-4">
      <div className={`${outerMaxWidth} w-full mx-auto mt-0 bg-white border border-line rounded-lg shadow-sm overflow-hidden`}>
        {/* Accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-yellow to-blue-mid to-purple-light" />

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="font-display text-3xl text-black tracking-wider">
              {profile.logoText} &bull; {profile.cityName.toUpperCase()}
            </h1>
            <p className="text-sm text-muted mt-1">Start your journey</p>
          </div>

          {/* Step indicator */}
          <p className="text-xs text-muted text-center mb-6">Step {step} of {totalSteps}</p>

          {/* ── Step 1: Personal info + Password ── */}
          {step === 1 && (
            <form onSubmit={handleNextFromStep1} noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelClass} htmlFor="first_name">First Name <span className="text-danger">*</span></label>
                  <input id="first_name" name="first_name" type="text" required value={form.first_name} onChange={handleChange} className={inputClass} autoComplete="given-name" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="last_name">Last Name <span className="text-danger">*</span></label>
                  <input id="last_name" name="last_name" type="text" required value={form.last_name} onChange={handleChange} className={inputClass} autoComplete="family-name" />
                </div>
              </div>

              {/* Email is long — give it the full row on mobile so it doesn't get
                  squeezed next to phone. On desktop (sm:), email takes 2/3 and
                  phone takes 1/3 so the row still looks balanced. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="email">Email <span className="text-danger">*</span></label>
                  <input id="email" name="email" type="email" required value={form.email} onChange={handleChange} className={inputClass} autoComplete="email" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="phone">Phone</label>
                  <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} className={inputClass} autoComplete="tel" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className={labelClass} htmlFor="birth_month">Born</label>
                  <select id="birth_month" name="birth_month" value={form.birth_month} onChange={handleChange} className={inputClass}>
                    <option value="">Month</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2000, i).toLocaleString("en-US", { month: "short" })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="birth_year">Birth Year</label>
                  <input id="birth_year" name="birth_year" type="number" min="1900" max={new Date().getFullYear()} placeholder="YYYY" value={form.birth_year} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="gender">Gender</label>
                  <select id="gender" name="gender" value={form.gender} onChange={handleChange} className={inputClass}>
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 mt-5">Emergency Contact</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelClass} htmlFor="emergency_contact_name">Name</label>
                  <input id="emergency_contact_name" name="emergency_contact_name" type="text" value={form.emergency_contact_name} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="emergency_contact_phone">Phone</label>
                  <input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" value={form.emergency_contact_phone} onChange={handleChange} className={inputClass} />
                </div>
              </div>

              <div className="mb-5">
                <label className={labelClass} htmlFor="emergency_contact_relationship">Relationship</label>
                <select
                  id="emergency_contact_relationship"
                  name="emergency_contact_relationship"
                  value={form.emergency_contact_relationship}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select…</option>
                  <option value="spouse">Spouse</option>
                  <option value="partner">Partner</option>
                  <option value="parent">Parent</option>
                  <option value="sibling">Sibling</option>
                  <option value="child">Child</option>
                  <option value="friend">Friend</option>
                  <option value="colleague">Colleague</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <label className="flex items-start gap-2 mb-5 cursor-pointer">
                <input name="communication_opt_in" type="checkbox" checked={form.communication_opt_in} onChange={handleChange} className="mt-0.5 shrink-0" />
                <span className="text-xs text-ink leading-snug">I agree to receive updates and class reminders</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelClass} htmlFor="password">Password <span className="text-danger">*</span></label>
                  <input id="password" name="password" type="password" required value={form.password} onChange={handleChange} className={inputClass} autoComplete="new-password" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="confirm_password">Confirm Password <span className="text-danger">*</span></label>
                  <input id="confirm_password" name="confirm_password" type="password" required value={form.confirm_password} onChange={handleChange} className={inputClass} autoComplete="new-password" />
                </div>
              </div>

              {/* Live password requirements.
                  All 5 rows render unconditionally so the layout never shifts
                  as the user types. The "passwords match" row shows an empty
                  circle until the confirm field has content AND matches. */}
              {(() => {
                // Length is the single most predictive factor of how
                // hard a password is to crack. We drop the legacy
                // "uppercase + lowercase + number" requirements —
                // those push users toward patterns like `Password1!`
                // that score high on complexity rules but are easy
                // to guess. A 12-character passphrase is stronger
                // than any 8-character `P@ssw0rd!`-style password
                // AND easier to remember.
                const longEnough = form.password.length >= 10;
                const matches = form.confirm_password.length > 0 && form.password === form.confirm_password;
                const Req = ({ met, label }: { met: boolean; label: string }) => (
                  <div className={`flex items-center gap-1.5 text-xs transition-colors duration-200 ${met ? "text-success" : "text-muted"}`}>
                    {met
                      ? <Check className="w-3 h-3 shrink-0" />
                      : <Circle className="w-3 h-3 shrink-0 opacity-40" />}
                    {label}
                  </div>
                );
                return (
                  <div className="mb-6 space-y-0.5">
                    <Req met={longEnough} label="At least 10 characters" />
                    <Req met={matches} label="Passwords match" />
                    <p className="text-[10px] text-muted/70 mt-2 italic">
                      Tip: a memorable three-word passphrase beats a short cryptic password.
                    </p>
                  </div>
                );
              })()}

              {/* ToS + Privacy consent — required before account creation.
                  HTML5 `required` alone is not enough: the submit is JS-
                  driven, not a raw form post. Using controlled state
                  + programmatic block. */}
              <label className="flex items-start gap-2 mb-4 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 shrink-0 w-4 h-4"
                  required
                />
                <span className="text-xs text-muted leading-relaxed">
                  I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              {error && <p className="text-xs text-danger mb-4">{error}</p>}
              <button
                type="submit"
                disabled={
                  form.password.length < 10 ||
                  form.confirm_password.length === 0 ||
                  form.password !== form.confirm_password ||
                  !termsAccepted
                }
                className={btnClass}
              >
                Next
              </button>
            </form>
          )}

          {/* ── Step 2: Waiver (if template exists) or Training (if no template) ── */}
          {step === 2 && waiverTemplate && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                {waiverTemplate.title}
              </p>
              <p className="text-xs text-muted mb-3">
                Version {waiverTemplate.version} — Scroll to the bottom and read the full document before signing.
              </p>

              <div
                className="max-h-72 md:max-h-96 overflow-y-auto border border-line rounded p-3 prose prose-sm max-w-none text-ink text-xs mb-4"
                onScroll={handleWaiverScroll}
              >
                <ReactMarkdown>{waiverTemplate.body_md}</ReactMarkdown>
              </div>

              <label className={`flex items-start gap-3 mb-4 ${hasScrolledWaiver ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
                <input
                  type="checkbox"
                  checked={waiverAgreed}
                  onChange={(e) => hasScrolledWaiver && setWaiverAgreed(e.target.checked)}
                  disabled={!hasScrolledWaiver}
                  className="mt-0.5 w-4 h-4 rounded border-line accent-black flex-shrink-0"
                />
                <span className="text-sm text-ink">
                  I have read and agree to the terms above
                  {!hasScrolledWaiver && (
                    <span className="block text-xs text-muted mt-0.5">Scroll to the bottom to enable</span>
                  )}
                </span>
              </label>

              {/* Signature capture — required to advance.
                  The agreement checkbox alone is not legally strong enough; a
                  drawn signature is what gets stored in waiver_signatures and
                  shown back on the profile page. */}
              {waiverAgreed && (
                <div className="mb-5">
                  <label className={labelClass}>Your Signature <span className="text-danger">*</span></label>
                  <InlineSignaturePad onData={setWaiverSignature} />
                  <p className="text-xs text-muted mt-1">
                    Sign using your finger or mouse. You can clear and retry.
                  </p>
                </div>
              )}

              {error && <p className="text-xs text-danger mb-4">{error}</p>}

              <button
                type="button"
                disabled={!waiverAgreed || !waiverSignature}
                onClick={handleNextFromWaiver}
                className={btnClass}
              >
                Next
              </button>

              <button
                type="button"
                onClick={() => { setError(""); setStep(1); }}
                className="mt-3 w-full text-sm text-muted hover:text-ink text-center inline-flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />Back
              </button>
            </div>
          )}

          {/* ── Step 2 (no waiver) or Step 3 (with waiver): Training background ── */}
          {((step === 2 && !waiverTemplate) || (step === 3 && waiverTemplate)) && (
            <div>
              {/* When there's no active waiver template, show a brief notice
                  before the training form so the skip feels intentional. */}
              {!waiverTemplate && !noWaiverAcknowledged && (
                <div className="mb-6 rounded-lg border border-line bg-off-white p-4 text-sm text-ink">
                  <p className="font-semibold mb-1">No waiver required at this time</p>
                  <p className="text-muted text-xs leading-relaxed">
                    No waiver is required at this time. Your gym may ask you to sign one later —
                    you&apos;ll see a notice in your member portal when that happens.
                  </p>
                  <button
                    type="button"
                    onClick={() => setNoWaiverAcknowledged(true)}
                    className="mt-3 px-4 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-near-black"
                  >
                    Got it, continue
                  </button>
                </div>
              )}

              {(waiverTemplate || noWaiverAcknowledged) && (<>
              <BeltEditor
                description="Optional — helps us track your progress and promotions."
                value={{
                  belt: form.belt,
                  stripes: form.stripes,
                  beltAwardedAt: form.belt_awarded_date,
                  trainingStartedAt: form.training_started_date,
                }}
                onChange={(next: BeltEditorValue) =>
                  setForm((f) => ({
                    ...f,
                    belt: next.belt as Belt,
                    stripes: next.stripes,
                    belt_awarded_date: next.beltAwardedAt,
                    training_started_date: next.trainingStartedAt,
                  }))
                }
              />

              {error && <p className="text-xs text-danger mt-4 mb-4">{error}</p>}

              <button
                type="button"
                disabled={loading || redirecting}
                onClick={() => handleSubmit(false)}
                className={btnClass}
              >
                {loading || redirecting
                  ? <SpinnerButton label={redirecting ? "Redirecting" : "Joining"} />
                  : profile.joinButtonText}
              </button>
              <button
                type="button"
                disabled={loading || redirecting}
                onClick={() => handleSubmit(true)}
                className="mt-3 w-full text-sm text-muted hover:text-ink text-center disabled:opacity-50"
              >
                Skip for now
              </button>

              <button
                type="button"
                disabled={loading || redirecting}
                onClick={() => {
                  setError("");
                  setStep(waiverTemplate ? 2 : 1);
                }}
                className="mt-2 w-full text-sm text-muted hover:text-ink text-center inline-flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />Back
              </button>
              </>)}
            </div>
          )}

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-muted">
            Already a member?{" "}
            <Link href="/portal/login" className="text-ink font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
