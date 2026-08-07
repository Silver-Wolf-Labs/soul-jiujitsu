"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/client";
import { useGymProfile } from "@/lib/gym-profile-context";
import { createMemberProfile } from "@/lib/actions/auth";
import { checkEmailDeliverability } from "@/lib/actions/email-deliverability";
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

/**
 * The signed-in auth user, resolved server-side by `page.tsx`, or null for an
 * anonymous visitor. Only the fields this form prefills — the names are
 * best-effort (they come from the signUp metadata of the abandoned attempt) and
 * may be empty strings.
 */
export interface ExistingUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface Props {
  waiverTemplate: WaiverTemplate | null;
  existingUser: ExistingUser | null;
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
            alt="Tu firma"
            className="w-full h-auto block"
          />
          <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
            <span className="text-xs text-success font-medium bg-white/80 px-1.5 py-0.5 rounded">
              ✓ Firmado
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
              <p className="text-line text-sm">Firma aquí con tu dedo o el mouse</p>
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
          Borrar
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
          Pantalla completa
        </button>
      </div>
      <p className="text-xs text-muted">
        Consejo: toca <strong className="font-medium text-ink">Pantalla completa</strong> para
        un área de firma más grande &mdash; ideal en el teléfono.
      </p>
    </div>
  );
}

export default function JoinForm({ waiverTemplate, existingUser }: Props) {
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

  // ── Completing a half-finished signup ──────────────────────────────────────
  // An auth user with no `members` row lands here from the middleware, which
  // treats that state as "mid-signup". Before this existed, /join could only
  // create a NEW account: it called signUp() with the email, Supabase returned
  // identities: [] (it never confirms whether an address is registered), and the
  // form stopped with "Ya existe una cuenta — inicia sesión". Login then bounced
  // the member straight back to /join. A closed loop that only a service-role
  // key could break.
  //
  // So: if there's already a session, skip signUp entirely and use that user id.
  // create_member_profile_tx is idempotent on user_id, so this is also the safe
  // way to retry a signup that died after the auth user was created.
  //
  // This used to be state populated by a `supabase.auth.getSession()` effect,
  // paired with a `sessionChecked` flag that held the whole card behind a
  // spinner until the check landed. The gate was there for a real reason — the
  // session decides whether password fields render and whether the email is
  // locked, so painting the form first would flash a signup form at a member who
  // is only here to finish their profile. The fix is not to drop the gate but to
  // remove the need for one: `page.tsx` is already an async RSC, so it resolves
  // the user before responding and hands it down. First paint is now correct by
  // construction — no spinner, no flash, and the server HTML contains the real
  // page instead of nothing.
  const existingUserId = existingUser?.id ?? null;

  // Typo correction offered by the email gate ("did you mean gmail.com?").
  // `emailSuggestion` drives the prompt; `emailKeptAsTyped` records the address
  // the member explicitly confirmed after being asked, so we prompt once and
  // then respect their answer instead of blocking the same click forever.
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [emailKeptAsTyped, setEmailKeptAsTyped] = useState<string | null>(null);

  // True while step 1's async checks (HIBP password + email deliverability)
  // are in flight, so the Next button can show progress instead of looking dead.
  const [checkingStep1, setCheckingStep1] = useState(false);

  // Prefilled directly from the server-resolved user so the very first render is
  // already correct. The email is also rendered read-only on this path: it
  // identifies the session being completed, so an edit would either fail
  // server-side (the RPC keys on user_id) or, worse, write a member row whose
  // email doesn't match the account the member actually logs in with.
  const [form, setForm] = useState({
    first_name: existingUser?.firstName ?? "",
    last_name: existingUser?.lastName ?? "",
    email: existingUser?.email ?? "",
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
      setError("Completa todos los campos requeridos.");
      return;
    }

    // Everything below applies only when we're about to create an account. A
    // member completing a half-finished signup already has a password (those
    // fields aren't rendered on that path) and an address that has already
    // received mail, so re-validating either would block the form on inputs
    // that don't exist or refuse a live account.
    if (!existingUserId) {
      // Local, synchronous checks first — no point spending a DNS lookup or an
      // HIBP round trip on a form that already fails offline.
      if (!form.password) { setError("Escribe una contraseña."); return; }
      if (form.password !== form.confirm_password) { setError("Las contraseñas no coinciden."); return; }
      if (form.password.length < 10) {
        setError("La contraseña debe tener al menos 10 caracteres. Una contraseña larga es más fuerte que una corta con símbolos.");
        return;
      }

      setCheckingStep1(true);
      try {
        // Email deliverability gate. This must run before signUp(): Supabase
        // mails whatever address it is given, and `type="email"` only checks
        // for an "@" — so a typo'd or reserved domain becomes a hard bounce.
        // Enough of those and the provider throttles sending for the whole
        // project, which is what prompted this gate.
        const gate = await checkEmailDeliverability(form.email);

        if (!gate.ok) {
          setError(gate.message);
          setEmailSuggestion(null);
          return;
        }

        // A near-miss on a common provider stops the flow ONCE and offers the
        // correction. Blocking outright would refuse valid-but-unusual
        // domains; proceeding silently would mail an address the member cannot
        // read. Once they confirm the address as typed, `emailKeptAsTyped`
        // matches and the next click goes through — the member has final say.
        if (gate.suggestion && gate.email !== emailKeptAsTyped) {
          setEmailSuggestion(gate.suggestion);
          return;
        }

        // Persist the normalized (trimmed, lowercased) address so the auth
        // user and the member row agree on casing.
        setForm((prev) => ({ ...prev, email: gate.email }));
        setEmailSuggestion(null);

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
      } finally {
        // Runs on every exit path, including the early returns above — leaving
        // this true would strand the member on a permanently disabled button.
        setCheckingStep1(false);
      }
    }

    setStep(2);
  }

  // Step 2 (waiver): go to step 3 (training)
  function handleNextFromWaiver() {
    setError("");
    if (!waiverAgreed) {
      setError("Debes aceptar el consentimiento para continuar.");
      return;
    }
    if (!waiverSignature) {
      setError("Dibuja tu firma arriba para continuar.");
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

    // Which user are we creating the member row for?
    //
    // Two paths reach this form:
    //   1. A visitor signing up  → create the auth user, then the member row.
    //   2. A signed-in user with no member row → the auth user already exists,
    //      so signUp() would return identities: [] and dead-end (see the
    //      existingUserId comment above). Reuse the session's id instead.
    let userId: string;

    if (existingUserId) {
      userId = existingUserId;
    } else {
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

      if (!authData.user) {
        setLoading(false);
        setError("No se pudo crear la cuenta. Intenta de nuevo.");
        return;
      }

      // Supabase's security model: when an email is already registered, signUp
      // returns a "fake" user object with identities: [] instead of an error, so
      // the server can't reveal account existence.
      //
      // Reaching this now means the address belongs to an account we are NOT
      // signed in as — genuinely "log in instead". The old dead-end was hitting
      // this branch while signed in as that very account; that case is handled
      // by the existingUserId path above and never gets here.
      if (authData.user.identities && authData.user.identities.length === 0) {
        setLoading(false);
        setError(
          `Ya existe una cuenta con ${form.email}. Inicia sesión o restablece tu contraseña.`
        );
        return;
      }

      userId = authData.user.id;
    }

    const result = await createMemberProfile({
      userId,
      // Null when completing an existing account: the password was set when the
      // account was created, and the field isn't shown on this path.
      password: existingUserId ? null : form.password,
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

    // Someone completing an existing session has already confirmed their email —
    // parking them on "check your inbox" would strand them waiting for a message
    // that is never sent. Send them where they were trying to go.
    if (existingUserId) {
      router.push("/portal");
      return;
    }

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
          {/* No loading gate here on purpose. `existingUser` arrives as a prop
              from the server, so everything below — the subtitle, whether the
              password fields exist, whether the email is locked — is decided
              before the first byte is sent. The previous spinner existed only to
              hide a client-side session check; keeping it would now trade a
              complete server-rendered page for a blank one. */}
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="font-display text-3xl text-black tracking-wider">
              {profile.logoText} &bull; {profile.cityName.toUpperCase()}
            </h1>
            <p className="text-sm text-muted mt-1">
              {existingUserId ? "Completa tu registro" : "Comienza tu camino"}
            </p>
          </div>

          {/* Why am I here? Without this, a member who just logged in and got
              redirected sees a signup form and assumes the login failed. */}
          {existingUserId && (
            <div className="mb-6 rounded border border-line bg-off-white px-4 py-3">
              <p className="text-xs text-ink leading-relaxed">
                Ya iniciaste sesión, pero falta completar tu ficha de socio. Llena
                estos datos una sola vez y entrarás directo a tu portal.
              </p>
            </div>
          )}

          {/* Step indicator */}
          <p className="text-xs text-muted text-center mb-6">Paso {step} de {totalSteps}</p>

          {/* ── Step 1: Personal info + Password ── */}
          {step === 1 && (
            <form onSubmit={handleNextFromStep1} noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelClass} htmlFor="first_name">Nombre <span className="text-danger">*</span></label>
                  <input id="first_name" name="first_name" type="text" required value={form.first_name} onChange={handleChange} className={inputClass} autoComplete="given-name" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="last_name">Apellido <span className="text-danger">*</span></label>
                  <input id="last_name" name="last_name" type="text" required value={form.last_name} onChange={handleChange} className={inputClass} autoComplete="family-name" />
                </div>
              </div>

              {/* Email is long — give it the full row on mobile so it doesn't get
                  squeezed next to phone. On desktop (sm:), email takes 2/3 and
                  phone takes 1/3 so the row still looks balanced. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="email">Correo <span className="text-danger">*</span></label>
                  {/* Read-only when completing an existing account: this address
                      identifies the session, and createMemberProfile rejects a
                      mismatch server-side anyway. Better to show it locked than
                      to let it be edited into a guaranteed error. */}
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    readOnly={!!existingUserId}
                    aria-describedby={
                      existingUserId
                        ? "email-locked-hint"
                        : emailSuggestion
                          ? "email-suggestion"
                          : undefined
                    }
                    className={existingUserId ? `${inputClass} bg-off-white text-muted cursor-not-allowed` : inputClass}
                    autoComplete="email"
                  />
                  {existingUserId && (
                    <p id="email-locked-hint" className="text-[10px] text-muted mt-1">
                      Es el correo de tu cuenta.
                    </p>
                  )}
                  {/* Typo prompt from the deliverability gate. `role="alert"` so a
                      screen reader announces it — the member is mid-flow and the
                      Next button appears to have done nothing without it. */}
                  {emailSuggestion && !existingUserId && (
                    <p id="email-suggestion" role="alert" className="text-xs text-ink mt-1.5">
                      ¿Quisiste decir{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, email: emailSuggestion }));
                          setEmailSuggestion(null);
                          setError("");
                        }}
                        className="font-semibold underline text-black hover:text-near-black"
                      >
                        {emailSuggestion}
                      </button>
                      ?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          // Record the address as confirmed so the gate stops
                          // asking, then let them press Next again.
                          setEmailKeptAsTyped(form.email.trim().toLowerCase());
                          setEmailSuggestion(null);
                          setError("");
                        }}
                        className="text-muted underline hover:text-ink"
                      >
                        No, usar el que escribí
                      </button>
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="phone">Teléfono</label>
                  <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} className={inputClass} autoComplete="tel" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className={labelClass} htmlFor="birth_month">Nacimiento</label>
                  <select id="birth_month" name="birth_month" value={form.birth_month} onChange={handleChange} className={inputClass}>
                    <option value="">Mes</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2000, i).toLocaleString("es-CR", { month: "short" })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="birth_year">Año de nacimiento</label>
                  <input id="birth_year" name="birth_year" type="number" min="1900" max={new Date().getFullYear()} placeholder="AAAA" value={form.birth_year} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="gender">Género</label>
                  <select id="gender" name="gender" value={form.gender} onChange={handleChange} className={inputClass}>
                    <option value="">Selecciona…</option>
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                    <option value="other">Otro</option>
                    <option value="prefer_not_to_say">Prefiero no decir</option>
                  </select>
                </div>
              </div>

              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 mt-5">Contacto de emergencia</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelClass} htmlFor="emergency_contact_name">Nombre</label>
                  <input id="emergency_contact_name" name="emergency_contact_name" type="text" value={form.emergency_contact_name} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="emergency_contact_phone">Teléfono</label>
                  <input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" value={form.emergency_contact_phone} onChange={handleChange} className={inputClass} />
                </div>
              </div>

              <div className="mb-5">
                <label className={labelClass} htmlFor="emergency_contact_relationship">Parentesco</label>
                <select
                  id="emergency_contact_relationship"
                  name="emergency_contact_relationship"
                  value={form.emergency_contact_relationship}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Selecciona…</option>
                  <option value="spouse">Cónyuge</option>
                  <option value="partner">Pareja</option>
                  <option value="parent">Padre / madre</option>
                  <option value="sibling">Hermano/a</option>
                  <option value="child">Hijo/a</option>
                  <option value="friend">Amistad</option>
                  <option value="colleague">Colega</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <label className="flex items-start gap-2 mb-5 cursor-pointer">
                <input name="communication_opt_in" type="checkbox" checked={form.communication_opt_in} onChange={handleChange} className="mt-0.5 shrink-0" />
                <span className="text-xs text-ink leading-snug">Quiero recibir avisos y recordatorios de clases</span>
              </label>

              {/* Password fields only when creating an account. A member
                  completing a half-finished signup already has one; asking
                  again would read as "set a new password" and confuse the
                  credential they already use to log in. */}
              {!existingUserId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelClass} htmlFor="password">Contraseña <span className="text-danger">*</span></label>
                  <input id="password" name="password" type="password" required value={form.password} onChange={handleChange} className={inputClass} autoComplete="new-password" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="confirm_password">Confirmar contraseña <span className="text-danger">*</span></label>
                  <input id="confirm_password" name="confirm_password" type="password" required value={form.confirm_password} onChange={handleChange} className={inputClass} autoComplete="new-password" />
                </div>
              </div>
              )}

              {/* Live password requirements.
                  All 5 rows render unconditionally so the layout never shifts
                  as the user types. The "passwords match" row shows an empty
                  circle until the confirm field has content AND matches. */}
              {!existingUserId && (() => {
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
                    <Req met={longEnough} label="Mínimo 10 caracteres" />
                    <Req met={matches} label="Las contraseñas coinciden" />
                    <p className="text-[10px] text-muted/70 mt-2 italic">
                      Consejo: una frase de tres palabras fáciles de recordar es más segura que una contraseña corta y críptica.
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
                  Acepto los{" "}
                  <a href="/terms" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                    Términos de servicio
                  </a>{" "}
                  y la{" "}
                  <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                    Política de privacidad
                  </a>
                  .
                </span>
              </label>

              {error && <p className="text-xs text-danger mb-4">{error}</p>}
              <button
                type="submit"
                disabled={
                  // On the completing path there are no password inputs, so
                  // gating on them would disable this button forever.
                  (!existingUserId && (
                    form.password.length < 10 ||
                    form.confirm_password.length === 0 ||
                    form.password !== form.confirm_password
                  )) ||
                  !termsAccepted ||
                  // Step 1 now makes two network round trips (the HIBP password
                  // check and the email deliverability gate). Without this the
                  // button looks inert for up to a few seconds and invites a
                  // second click, which would fire both checks again.
                  checkingStep1
                }
                className={btnClass}
              >
                {checkingStep1
                  ? <SpinnerButton label="Verificando…" />
                  : "Siguiente"}
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
                Versión {waiverTemplate.version} — Desplázate hasta el final y lee el documento completo antes de firmar.
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
                  Leí y acepto los términos anteriores
                  {!hasScrolledWaiver && (
                    <span className="block text-xs text-muted mt-0.5">Desplázate hasta el final para habilitar</span>
                  )}
                </span>
              </label>

              {/* Signature capture — required to advance.
                  The agreement checkbox alone is not legally strong enough; a
                  drawn signature is what gets stored in waiver_signatures and
                  shown back on the profile page. */}
              {waiverAgreed && (
                <div className="mb-5">
                  <label className={labelClass}>Tu firma <span className="text-danger">*</span></label>
                  <InlineSignaturePad onData={setWaiverSignature} />
                  <p className="text-xs text-muted mt-1">
                    Firma con tu dedo o el mouse. Puedes borrar e intentar de nuevo.
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
                Siguiente
              </button>

              <button
                type="button"
                onClick={() => { setError(""); setStep(1); }}
                className="mt-3 w-full text-sm text-muted hover:text-ink text-center inline-flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />Volver
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
                  <p className="font-semibold mb-1">No se requiere consentimiento por ahora</p>
                  <p className="text-muted text-xs leading-relaxed">
                    Por el momento no hay un consentimiento activo. La academia puede pedirte
                    firmar uno más adelante &mdash; verás un aviso en tu portal cuando eso pase.
                  </p>
                  <button
                    type="button"
                    onClick={() => setNoWaiverAcknowledged(true)}
                    className="mt-3 px-4 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-near-black"
                  >
                    Entendido, continuar
                  </button>
                </div>
              )}

              {(waiverTemplate || noWaiverAcknowledged) && (<>
              <BeltEditor
                description="Opcional — nos ayuda a llevar tu progreso y tus promociones."
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
                  ? <SpinnerButton label={
                      redirecting ? "Redirigiendo"
                      : existingUserId ? "Guardando"
                      : "Creando cuenta"
                    } />
                  : existingUserId ? "Completar registro" : profile.joinButtonText}
              </button>
              <button
                type="button"
                disabled={loading || redirecting}
                onClick={() => handleSubmit(true)}
                className="mt-3 w-full text-sm text-muted hover:text-ink text-center disabled:opacity-50"
              >
                Omitir por ahora
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
                <ArrowLeft className="w-3.5 h-3.5" />Volver
              </button>
              </>)}
            </div>
          )}

          {/* Footer. Pointing a signed-in member at "inicia sesión" would send
              them back around the loop this path exists to break. */}
          {!existingUserId && (
            <p className="mt-6 text-center text-xs text-muted">
              ¿Ya eres miembro?{" "}
              <Link href="/portal/login" className="text-ink font-semibold hover:underline">
                Inicia sesión
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
