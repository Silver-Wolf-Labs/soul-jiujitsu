"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGymProfile } from "@/lib/gym-profile-context";
import { substituteWaiverPlaceholders } from "@/lib/waiver-substitute";
import { updateOwnProfile, updateOwnEmergencyContact, updateOwnTrainingInfo, getOwnBeltHistory, getOwnCheckIns } from "@/lib/actions/portal";
import { signWaiver, getSignatureImageUrl } from "@/lib/actions/waivers";
import { createBillingPortalSession } from "@/lib/actions/billing";
import { formatCents, formatDateTz, formatDateTimeTz } from "@/lib/utils";
import { BeltColor } from "@/lib/constants";
import BeltVisual from "@/components/ui/BeltVisual";
import Spinner, { SpinnerButton } from "@/components/ui/Spinner";
import BeltHistoryList from "@/components/member/BeltHistoryList";
import CheckInsList from "@/components/member/CheckInsList";
import { SIGNATURE_INK, SIGNATURE_PAPER } from "@/components/signature/SignatureCanvas";
import type {
  Member, MemberMembership, MembershipPlan, MembershipStatus,
  WaiverTemplate, WaiverSignature, BeltHistory, CheckInRow,
} from "@/lib/supabase/types";

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = "personal" | "emergency" | "training" | "waiver" | "payment" | "billing" | "activity";
const TABS = [
  { id: "personal",  label: "Personal" },
  { id: "emergency", label: "Emergency" },
  { id: "training",  label: "Training" },
  { id: "waiver",    label: "Waiver" },
  { id: "payment",   label: "Payment" },
  { id: "billing",   label: "Billing" },
  { id: "activity",  label: "Activity" },
] as const;

const MEMBERSHIP_STATUS_COLORS: Record<MembershipStatus, string> = {
  trialing: "bg-blue-light text-blue",
  active: "bg-success-light text-success",
  paused: "bg-yellow-light text-yellow-dark",
  canceled: "bg-disabled-light text-muted",
  past_due: "bg-danger-light text-danger",
};

type MemberMembershipWithPlan = MemberMembership & { membership_plans: MembershipPlan | null };

// ── Relationship options ───────────────────────────────────────────────────

const RELATIONSHIP_OPTIONS = [
  { value: "spouse",    label: "Spouse" },
  { value: "partner",   label: "Partner" },
  { value: "parent",    label: "Parent" },
  { value: "sibling",   label: "Sibling" },
  { value: "child",     label: "Child" },
  { value: "friend",    label: "Friend" },
  { value: "colleague", label: "Colleague" },
  { value: "other",     label: "Other" },
] as const;


// ── SimpleMarkdown ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : p
  );
}

function SimpleMarkdown({ md }: { md: string }) {
  const lines = md.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith("# "))  return <h1 key={i} className="text-lg font-bold mt-5 mb-2 text-ink">{renderInline(line.slice(2))}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-sm font-semibold mt-4 mb-1.5 text-ink uppercase tracking-wide">{renderInline(line.slice(3))}</h2>;
        if (!line.trim())           return null;
        return <p key={i} className="text-sm text-ink mb-2 leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

// ── SignatureCanvas ────────────────────────────────────────────────────────

function SignatureCanvas({
  onData,
}: {
  onData: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function getCtx() {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    // Fixed ink, never the theme's --color-ink. The portal renders dark, and a
    // light stroke would produce a signature that is invisible here and, worse,
    // invisible on the white background the admin console and printed waiver use.
    // A signature is a legal record; it must not depend on the active theme.
    ctx.strokeStyle = SIGNATURE_INK;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }

  function pos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const sy = c.height / r.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    }
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  function onStart(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    const ctx = getCtx(); if (!ctx) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = getCtx(); if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    onData(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function onEnd() { drawing.current = false; }

  // Paint the paper rather than relying on the canvas being transparent over a
  // `bg-white` element: toDataURL() captures the bitmap, not the CSS behind it,
  // so a cleared-to-transparent canvas exports a signature with no background.
  // That renders as ink-on-white in most viewers but as ink-on-dark wherever the
  // PNG is composited over a dark surface — including this very page.
  function fillPaper(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
    ctx.fillStyle = SIGNATURE_PAPER;
    ctx.fillRect(0, 0, c.width, c.height);
  }

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) fillPaper(ctx, c);
  }, []);

  function clear() {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) fillPaper(ctx, c);
    onData(null);
  }

  return (
    <div className="space-y-1.5">
      <canvas
        ref={canvasRef}
        width={700}
        height={200}
        className="w-full border-2 border-dashed border-line rounded-lg cursor-crosshair"
        style={{ touchAction: "none" }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      />
      <button type="button" onClick={clear} className="text-xs text-muted hover:text-ink underline">
        Clear
      </button>
    </div>
  );
}

// ── WaiverModal ────────────────────────────────────────────────────────────

function WaiverModal({
  template,
  existingSignature,
  onClose,
  onSigned,
  nameInitials,
}: {
  template: WaiverTemplate;
  existingSignature: WaiverSignature | null;
  onClose: () => void;
  onSigned: () => void;
  /** Fallback initials for drawn signatures (see SignatureViewer). */
  nameInitials: string;
}) {
  const gymProfile = useGymProfile();
  const mode = existingSignature ? "view" : "sign";
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  async function handleSign() {
    if (!signatureData) { setSignError("Please draw your signature above."); return; }
    setSigning(true); setSignError(null);
    const result = await signWaiver(template.id, { type: "drawn", dataUrl: signatureData });
    if ("error" in result) { setSignError(result.error); setSigning(false); }
    else { onSigned(); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 backdrop-blur-sm">
      {/* Panel: full screen mobile, large centered desktop */}
      <div className="bg-white dark:bg-portal-card w-full h-full flex flex-col md:h-auto md:max-h-[92vh] md:max-w-3xl md:rounded-2xl md:overflow-hidden md:shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line flex-shrink-0">
          <div>
            <div className="font-display text-lg text-black dark:text-ink tracking-wide">{template.title}</div>
            <div className="text-xs text-muted mt-0.5">
              Version {template.version}
              {existingSignature
                ? ` · ${existingSignature.signature_type === "typed" ? `Signed with initials ${existingSignature.typed_initials ?? nameInitials}` : "Signed with signature"} on ${formatDateTimeTz(existingSignature.signed_at, gymProfile.timezone)}`
                : " · Please read and sign"}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-muted hover:text-ink rounded-full hover:bg-off-white transition-colors">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        {/* Waiver text — scrollable.
            For viewing a past signature, always show the stored snapshot
            verbatim (legal archive of what the member actually signed).
            For signing a fresh waiver, substitute placeholders so the
            member sees real gym details, not [GYM NAME] tokens. */}
        <div className="flex-1 overflow-y-auto px-5 py-4 md:px-8">
          <SimpleMarkdown
            md={
              mode === "view" && existingSignature
                ? existingSignature.snapshot_md
                : substituteWaiverPlaceholders(template.body_md, gymProfile)
            }
          />
        </div>

        {/* Bottom section */}
        <div className="flex-shrink-0 border-t border-line px-5 py-4 md:px-8 space-y-4 bg-white dark:bg-portal-card">
          {mode === "sign" ? (
            <>
              <div>
                <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Your Signature</div>
                <SignatureCanvas onData={setSignatureData} />
              </div>
              {signError && <p className="text-sm text-danger">{signError}</p>}
              <button
                onClick={handleSign}
                disabled={signing || !signatureData}
                className="w-full py-3 bg-black text-white dark:bg-yellow dark:text-black rounded-lg font-semibold text-sm hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {signing ? <SpinnerButton label="Signing" /> : "I agree — Sign Waiver"}
              </button>
              <p className="text-xs text-muted text-center">By signing, you agree to all terms in this document.</p>
            </>
          ) : existingSignature ? (
            <SignatureViewer signature={existingSignature} timezone={gymProfile.timezone} nameInitials={nameInitials} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── SignatureViewer ───────────────────────────────────────────────────────
// Shows typed initials OR drawn signature image for a past waiver signature.

function SignatureViewer({
  signature,
  timezone,
  nameInitials,
}: {
  signature: WaiverSignature;
  timezone: string;
  /** Fallback initials (first-letter + last-letter of member name) for drawn
   *  signatures that don't have typed_initials set. Used to render a
   *  consistent "Signed as XY on …" caption across signature types. */
  nameInitials: string;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (signature.signature_type === "drawn" && signature.signature_path) {
      // Use server action to generate signed URL — the signatures bucket is
      // private with no member-level SELECT policy, so client-side
      // createSignedUrl would fail.
      getSignatureImageUrl(signature.signature_path).then((result) => {
        if ("url" in result) setImgUrl(result.url);
      });
    }
  }, [signature.signature_type, signature.signature_path]);

  const attributionInitials =
    signature.signature_type === "typed" && signature.typed_initials
      ? signature.typed_initials
      : nameInitials;

  const attribution = (
    <p className="text-xs text-muted mt-1">
      Signed as <span className="font-semibold text-black dark:text-ink tracking-widest">{attributionInitials}</span> on {formatDateTimeTz(signature.signed_at, timezone)}
    </p>
  );

  if (signature.signature_type === "typed" && signature.typed_initials) {
    return (
      <div>
        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Your Initials</div>
        <div className="border border-line rounded-lg bg-off-white px-4 py-3 text-2xl font-semibold tracking-[0.3em] text-black dark:text-ink text-center select-none">
          {signature.typed_initials}
        </div>
        {attribution}
      </div>
    );
  }

  if (signature.signature_type === "drawn") {
    return (
      <div>
        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Your Signature</div>
        {imgUrl ? (
          // bg-white with NO dark: variant, deliberately. The stored PNG is
          // ink-on-white (see SIGNATURE_PAPER); painting a dark card behind it
          // would frame a white rectangle in a dark box, and for a transparent
          // legacy PNG it would hide the signature entirely.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt="Your signature" className="max-w-sm w-full border border-line rounded-lg bg-white p-2" />
        ) : (
          <div className="flex items-center justify-center h-20 border border-line rounded-lg bg-off-white">
            <Spinner size="sm" delay={false} />
          </div>
        )}
        {attribution}
      </div>
    );
  }

  // Legacy fallback — signature_data (deprecated field)
  if (signature.signature_data) {
    return (
      <div>
        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Your Signature</div>
        {/* Literal white, no dark: variant — same reason as the drawn case above. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signature.signature_data} alt="Your signature" className="max-w-sm w-full border border-line rounded-lg bg-white p-2" />
        {attribution}
      </div>
    );
  }

  return attribution;
}

// ── ProfilePage (main export) ──────────────────────────────────────────────

export default function ProfilePage() {
  const searchParams = useSearchParams();
  // Initial tab honors ?tab= so deep links from the portal home card
  // (e.g. "View details" on the waiver card) land on the right section.
  // The value is validated against the TABS list to block anything weird.
  const initialTab: Tab = (() => {
    const q = searchParams.get("tab");
    return (TABS.find((t) => t.id === q)?.id as Tab) ?? "personal";
  })();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [member,    setMember]    = useState<Member | null>(null);
  const [memberships, setMemberships] = useState<MemberMembershipWithPlan[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data: m } = await supabase.from("members").select("*").eq("user_id", userData.user.id).single();
      if (m) {
        setMember(m as Member);
        const { data: ms } = await supabase
          .from("member_memberships").select("*, membership_plans(*)")
          .eq("member_id", m.id).order("started_at", { ascending: false });
        setMemberships((ms ?? []) as MemberMembershipWithPlan[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner label="Loading" /></div>;
  if (!member) return <div className="text-sm text-muted py-8">No member record found.</div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="font-display text-2xl text-black dark:text-ink">My Profile</h1>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-line overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-black text-black dark:border-yellow dark:text-ink"
                : "border-b-2 border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-portal-card border border-line rounded-lg p-6">
        {activeTab === "personal"  && <PersonalInfoTab member={member} onSave={u => setMember({ ...member, ...u })} />}
        {activeTab === "emergency" && <EmergencyContactTab member={member} onSave={u => setMember({ ...member, ...u })} />}
        {activeTab === "training"  && <TrainingTab member={member} memberships={memberships} onSave={u => setMember({ ...member, ...u })} />}
        {activeTab === "waiver"    && <WaiverTab member={member} onSigned={() => setMember({ ...member, waiver_signed_at: new Date().toISOString() })} />}
        {activeTab === "payment"   && <PaymentMethodsTab />}
        {activeTab === "billing"   && <BillingHistoryTab memberships={memberships} />}
        {activeTab === "activity"  && <ActivityTab memberships={memberships} />}
      </div>
    </div>
  );
}

// ── PersonalInfoTab ────────────────────────────────────────────────────────

function PersonalInfoTab({
  member,
  onSave,
}: {
  member: Member;
  onSave: (data: Partial<Member>) => void;
}) {
  const [firstName, setFirstName] = useState(member.first_name);
  const [lastName, setLastName] = useState(member.last_name);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [birthMonth, setBirthMonth] = useState<number | "">(member.birth_month ?? "");
  const [birthYear, setBirthYear] = useState<number | "">(member.birth_year ?? "");
  const [gender, setGender] = useState(member.gender ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrorMsg("");
    startTransition(async () => {
      const result = await updateOwnProfile({
        first_name: firstName,
        last_name: lastName,
        phone,
        birth_month: birthMonth || null,
        birth_year: birthYear || null,
        gender: gender || null,
      });
      if ("error" in result) {
        setStatus("error");
        setErrorMsg(result.error);
      } else {
        setStatus("success");
        onSave({ first_name: firstName, last_name: lastName, phone, birth_month: birthMonth || null, birth_year: birthYear || null, gender: (gender || null) as Member["gender"] });
        setTimeout(() => setStatus("idle"), 3000);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
            First Name
          </label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
            Last Name
          </label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
          Email
        </label>
        <input
          value={member.email}
          disabled
          className="w-full border border-line rounded px-3 py-2 text-sm bg-off-white text-muted cursor-not-allowed"
        />
        <p className="text-xs text-muted mt-1">Contact the gym to update your email.</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
          Phone
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
          placeholder="(555) 000-0000"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
            Birth Month
          </label>
          <select
            value={birthMonth}
            onChange={(e) => setBirthMonth(e.target.value ? Number(e.target.value) : "")}
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
          >
            <option value="">Month</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleString("en-US", { month: "short" })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
            Birth Year
          </label>
          <input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : "")}
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            placeholder="YYYY"
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
            Gender
          </label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
      </div>

      {status === "error" && (
        <p className="text-sm text-danger bg-danger-light border border-danger-border rounded px-3 py-2">
          {errorMsg}
        </p>
      )}
      {status === "success" && (
        <p className="text-sm text-success bg-success-light border border-success-border rounded px-3 py-2">
          Profile updated successfully.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || status === "saving"}
        className="px-4 py-2 bg-black text-white dark:bg-yellow dark:text-black rounded text-sm font-semibold hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-50 transition-colors"
      >
        {status === "saving" ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}

// ── EmergencyContactTab ────────────────────────────────────────────────────

function EmergencyContactTab({
  member,
  onSave,
}: {
  member: Member;
  onSave: (data: Partial<Member>) => void;
}) {
  const [name,         setName]         = useState(member.emergency_contact_name         ?? "");
  const [phone,        setPhone]        = useState(member.emergency_contact_phone        ?? "");
  const [relationship, setRelationship] = useState(member.emergency_contact_relationship ?? "");
  const [status,    setStatus]    = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg,  setErrorMsg]  = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving"); setErrorMsg("");
    startTransition(async () => {
      const result = await updateOwnEmergencyContact({
        emergency_contact_name: name,
        emergency_contact_phone: phone,
        emergency_contact_relationship: relationship,
      });
      if ("error" in result) { setStatus("error"); setErrorMsg(result.error); }
      else {
        setStatus("success");
        onSave({ emergency_contact_name: name, emergency_contact_phone: phone, emergency_contact_relationship: relationship });
        setTimeout(() => setStatus("idle"), 3000);
      }
    });
  }

  const labelClass = "block text-xs font-semibold text-muted uppercase tracking-wide mb-1";
  const inputClass = "w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label className={labelClass} htmlFor="ec_name">Full Name</label>
        <input id="ec_name" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="Full name" />
      </div>
      <div>
        <label className={labelClass} htmlFor="ec_phone">Phone Number</label>
        <input id="ec_phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="(555) 000-0000" />
      </div>
      <div>
        <label className={labelClass} htmlFor="ec_relationship">Relationship</label>
        <select
          id="ec_relationship"
          value={relationship}
          onChange={e => setRelationship(e.target.value)}
          className={inputClass}
        >
          <option value="">Select…</option>
          {RELATIONSHIP_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {status === "error"   && <p className="text-sm text-danger bg-danger-light border border-danger-border rounded px-3 py-2">{errorMsg}</p>}
      {status === "success" && <p className="text-sm text-success bg-success-light border border-success-border rounded px-3 py-2">Emergency contact updated.</p>}

      <button
        type="submit"
        disabled={isPending || status === "saving"}
        className="px-4 py-2 bg-black text-white dark:bg-yellow dark:text-black rounded text-sm font-semibold hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-50 transition-colors"
      >
        {status === "saving" ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}

// ── PaymentMethodsTab ──────────────────────────────────────────────────────

function PaymentMethodsTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleManageBilling() {
    setLoading(true);
    setError(null);
    try {
      const result = await createBillingPortalSession();
      if ("error" in result) {
        setError(result.error);
      } else {
        window.location.href = result.url;
        return; // Don't clear loading — navigating away
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-md">
      <div className="border border-line rounded-lg p-6 text-center space-y-4">
        <div className="mx-auto w-14 h-10 bg-off-white border border-line rounded flex items-center justify-center">
          <svg
            className="w-7 h-5 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        </div>
        <p className="text-sm text-muted">
          Manage your payment methods, view invoices, and update billing info through our secure billing portal.
        </p>
        {error && (
          <p className="text-xs text-danger bg-danger-light border border-danger-border rounded px-3 py-2">
            {error}
          </p>
        )}
        <div>
          <button
            onClick={handleManageBilling}
            disabled={loading}
            className="px-4 py-2 bg-black text-white dark:bg-yellow dark:text-black border border-black dark:border-yellow rounded text-sm font-semibold hover:bg-near-black dark:hover:bg-yellow-deep transition-colors disabled:opacity-50"
          >
            {loading ? "Opening…" : "Manage Billing"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BillingHistoryTab ──────────────────────────────────────────────────────

function BillingHistoryTab({ memberships }: { memberships: MemberMembershipWithPlan[] }) {
  const gymProfile = useGymProfile();
  function formatDateOrDash(d: string | null) { return d ? formatDateTz(d, gymProfile.timezone) : "—"; }
  if (memberships.length === 0) {
    return <p className="text-sm text-muted">No billing history.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide pb-2 pr-4">Plan</th>
            <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide pb-2 pr-4">Status</th>
            <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide pb-2 pr-4">Price</th>
            <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide pb-2 pr-4">Started</th>
            <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide pb-2 pr-4">Next Billing</th>
            <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide pb-2">Ended</th>
          </tr>
        </thead>
        <tbody>
          {memberships.map((ms) => {
            const effectivePrice = ms.override_price_cents ?? ms.locked_price_cents;
            const nextBilling = ms.ends_at
              ? `Cancels ${formatDateOrDash(ms.ends_at)}`
              : (ms.status === "active" || ms.status === "trialing") && ms.current_period_end
              ? formatDateOrDash(ms.current_period_end)
              : "—";
            return (
              <tr key={ms.id} className="border-b border-line last:border-0">
                <td className="py-3 pr-4 text-ink">{ms.membership_plans?.name ?? "—"}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${MEMBERSHIP_STATUS_COLORS[ms.status]}`}
                  >
                    {ms.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-ink">{formatCents(effectivePrice)}</td>
                <td className="py-3 pr-4 text-muted">{formatDateOrDash(ms.started_at)}</td>
                <td className="py-3 pr-4 text-muted text-xs">{nextBilling}</td>
                <td className="py-3 text-muted">{formatDateOrDash(ms.ends_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── BeltHistorySection ────────────────────────────────────────────────────

function BeltHistorySection() {
  const [history, setHistory] = useState<BeltHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOwnBeltHistory()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <div className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Belt History</div>
        <div className="flex justify-center py-4"><Spinner size="sm" delay={false} /></div>
      </div>
    );
  }

  if (history.length === 0) return null;

  return (
    <div>
      <div className="block text-xs font-semibold text-muted uppercase tracking-wide mb-3">Belt History</div>
      <BeltHistoryList entries={history} />
    </div>
  );
}

// ── TrainingTab ────────────────────────────────────────────────────────────

function TrainingTab({
  member,
  memberships,
  onSave,
}: {
  member: Member;
  memberships: MemberMembershipWithPlan[];
  onSave: (data: Partial<Member>) => void;
}) {
  const gymProfile = useGymProfile();
  const belt    = (member.belt   ?? "white") as BeltColor;
  const stripes = member.stripes ?? 0;

  const [trainingDate, setTrainingDate] = useState(member.training_started_at ?? "");
  const [status,    setStatus]    = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg,  setErrorMsg]  = useState("");
  const [isPending, startTransition] = useTransition();

  const MS_PER_YEAR   = 365.25 * 24 * 3600 * 1000;
  const beltDate      = member.belt_awarded_at ?? null;  // read-only — set by coaches
  const yearsOnBelt   = beltDate     ? ((Date.now() - new Date(`${beltDate}T00:00:00Z`).getTime()) / MS_PER_YEAR).toFixed(1) : null;
  const yearsTraining = trainingDate ? ((Date.now() - new Date(`${trainingDate}T00:00:00Z`).getTime()) / MS_PER_YEAR).toFixed(1) : null;
  const beltAwardedDisplay = beltDate
    ? formatDateTz(new Date(`${beltDate}T00:00:00Z`), gymProfile.timezone)
    : null;

  // Active membership time: sum only active/trialing periods, not paused/canceled gaps
  const now = Date.now();
  const activeMembershipMs = memberships.reduce((total, m) => {
    const start = new Date(m.started_at).getTime();
    const end = m.canceled_at
      ? new Date(m.canceled_at).getTime()
      : m.ends_at
        ? new Date(m.ends_at).getTime()
        : now;
    return total + Math.max(0, end - start);
  }, 0);
  const activeMembershipYears = memberships.length > 0
    ? (activeMembershipMs / MS_PER_YEAR).toFixed(1)
    : null;

  const gymJoinedDate = formatDateTz(member.created_at, gymProfile.timezone);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving"); setErrorMsg("");
    startTransition(async () => {
      const result = await updateOwnTrainingInfo({
        training_started_at: trainingDate || null,
      });
      if ("error" in result) { setStatus("error"); setErrorMsg(result.error); }
      else {
        setStatus("success");
        onSave({ training_started_at: trainingDate || null });
        setTimeout(() => setStatus("idle"), 3000);
      }
    });
  }

  const labelClass = "block text-xs font-semibold text-muted uppercase tracking-wide mb-1";
  const inputClass = "border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow";

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-8">

    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Belt rank — read only */}
      <div>
        <div className={labelClass}>Current Rank</div>
        <BeltVisual belt={belt} stripes={stripes} />
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-sm font-semibold capitalize text-ink">{belt} Belt</span>
          <span className="text-sm text-muted">· {stripes} {stripes === 1 ? "stripe" : "stripes"}</span>
        </div>
        <p className="text-xs text-muted mt-1">Belt rank is managed by your coaches.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-off-white rounded-lg px-4 py-3">
          <div className="font-display text-lg text-black dark:text-ink leading-tight">{gymJoinedDate}</div>
          <div className="text-xs text-muted mt-0.5">joined {gymProfile.shortName}</div>
        </div>
        {activeMembershipYears && (
          <div className="bg-off-white rounded-lg px-4 py-3">
            <div className="font-display text-2xl text-black dark:text-ink">{activeMembershipYears}y</div>
            <div className="text-xs text-muted mt-0.5">active at gym</div>
          </div>
        )}
        {yearsTraining && (
          <div className="bg-off-white rounded-lg px-4 py-3">
            <div className="font-display text-2xl text-black dark:text-ink">{yearsTraining}y</div>
            <div className="text-xs text-muted mt-0.5">training BJJ total</div>
          </div>
        )}
        {/* "Years on this belt" tile is hidden for white belt — a white
            belt has no awarding event, so there's no duration to show. */}
        {yearsOnBelt && belt !== "white" && (
          <div className="bg-off-white rounded-lg px-4 py-3">
            <div className="font-display text-2xl text-black dark:text-ink">{yearsOnBelt}y</div>
            <div className="text-xs text-muted mt-0.5">on this belt</div>
          </div>
        )}
      </div>

      {/* Belt awarded — read only, set by coaches. Hidden for white belt
          (there is no awarding event for the starting belt). */}
      {belt !== "white" && (
        <div>
          <div className={labelClass}>Belt Awarded</div>
          <div className="text-sm text-ink font-medium">
            {beltAwardedDisplay ?? <span className="text-muted italic">Not recorded yet</span>}
          </div>
          {yearsOnBelt && <p className="text-xs text-muted mt-1">{yearsOnBelt} years on this belt</p>}
          <p className="text-xs text-muted mt-1">Set by your coaches when your belt is awarded.</p>
        </div>
      )}

      {/* Training started date */}
      <div>
        <label className={labelClass} htmlFor="training_started_date">Training Since</label>
        <input
          id="training_started_date"
          type="date"
          value={trainingDate}
          onChange={e => setTrainingDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className={`${inputClass} w-44`}
        />
        <p className="text-xs text-muted mt-1">When you first started training BJJ.</p>
      </div>

      {/* Feedback — reserved space prevents layout shift */}
      <div className="min-h-[2.5rem]">
        {status === "error"   && <p className="text-sm text-danger bg-danger-light border border-danger-border rounded px-3 py-2">{errorMsg}</p>}
        {status === "success" && <p className="text-sm text-success bg-success-light border border-success-border rounded px-3 py-2">Training info updated.</p>}
      </div>

      <button
        type="submit"
        disabled={isPending || status === "saving"}
        className="px-4 py-2 bg-black text-white dark:bg-yellow dark:text-black rounded text-sm font-semibold hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-50 transition-colors"
      >
        {status === "saving" ? "Saving…" : "Save Changes"}
      </button>

    </form>

    {/* Belt history — right column on laptop, stacked below on mobile/tablet */}
    <BeltHistorySection />

    </div>
  );
}

// ── WaiverTab ──────────────────────────────────────────────────────────────

function WaiverTab({
  member,
  onSigned,
}: {
  member: Member;
  onSigned: () => void;
}) {
  const gymProfile = useGymProfile();
  const [template, setTemplate] = useState<WaiverTemplate | null>(null);
  const [signature, setSignature] = useState<WaiverSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Name initials — used for drawn-signature attribution and as the typed-
  // initials fallback when signature_type === "typed" but typed_initials is null.
  const nameInitials = `${(member.first_name?.[0] ?? "").toUpperCase()}${(member.last_name?.[0] ?? "").toUpperCase()}`;

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: tmpl }, { data: sig }] = await Promise.all([
        supabase.from("waiver_templates").select("*").eq("active", true).single(),
        supabase.from("waiver_signatures").select("*").eq("member_id", member.id)
          .order("signed_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setTemplate(tmpl);
      setSignature(sig);
      setLoading(false);
    }
    load();
  }, [member.id]);

  if (loading) return <div className="flex justify-center py-8"><Spinner size="sm" /></div>;

  const signed = !!member.waiver_signed_at;

  return (
    <div className="max-w-lg space-y-5">
      {/* Status card */}
      <div className={`rounded-xl border p-5 flex items-start gap-4 ${signed ? "border-success-border bg-success-light" : "border-danger-border bg-danger-light"}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${signed ? "bg-success/10" : "bg-danger/10"}`}>
          {signed ? (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-success">
              <path d="M3 8l3.5 3.5L13 4" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-danger">
              <path d="M8 3v5M8 11v1" />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <div className={`font-semibold text-sm ${signed ? "text-success" : "text-danger"}`}>
            {signed ? "Waiver Signed" : "Waiver Not Signed"}
          </div>
          <div className={`text-xs mt-0.5 ${signed ? "text-success" : "text-danger"}`}>
            {signed ? (
              <>
                {signature?.signature_type === "typed"
                  ? <>Signed with initials <span className="font-semibold tracking-widest">{signature.typed_initials ?? nameInitials}</span></>
                  : "Signed with signature"}
                {" on "}
                {formatDateTimeTz(member.waiver_signed_at!, gymProfile.timezone)}
              </>
            ) : "You must sign the waiver to participate."}
          </div>
        </div>
      </div>

      {/* No template */}
      {!template && (
        <p className="text-sm text-muted">No waiver template on file. Please contact the gym.</p>
      )}

      {/* Actions */}
      {template && (
        <button
          onClick={() => setShowModal(true)}
          className="px-5 py-2.5 bg-black text-white dark:bg-yellow dark:text-black rounded-lg text-sm font-semibold hover:bg-near-black dark:hover:bg-yellow-deep transition-colors"
        >
          {signed ? "View Waiver & Signature" : "Read & Sign Waiver"}
        </button>
      )}

      {/* Modal */}
      {showModal && template && (
        <WaiverModal
          template={template}
          existingSignature={signed ? signature : null}
          onClose={() => setShowModal(false)}
          onSigned={() => { onSigned(); setSignature(null); }}
          nameInitials={nameInitials}
        />
      )}
    </div>
  );
}

// ── ActivityTab ────────────────────────────────────────────────────────────

const MEMBERSHIP_TIMELINE_CONFIG: Record<MembershipStatus, {
  dot: string;
  label: string;
  labelColor: string;
}> = {
  active:   { dot: "bg-success",     label: "Active",    labelColor: "text-success"    },
  trialing: { dot: "bg-blue",       label: "Trial",     labelColor: "text-blue"       },
  paused:   { dot: "bg-yellow",     label: "Paused",    labelColor: "text-yellow-dark"},
  canceled: { dot: "bg-line",       label: "Canceled",  labelColor: "text-muted"      },
  past_due: { dot: "bg-danger",     label: "Past Due",  labelColor: "text-danger"     },
};

function ActivityTab({ memberships }: { memberships: MemberMembershipWithPlan[] }) {
  const gymProfile = useGymProfile();
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getOwnCheckIns(50);
        setCheckIns(data);
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Spinner size="sm" /></div>;

  // Parse class_date as UTC to avoid off-by-one day errors in non-UTC timezones
  const now = Date.now();
  const toUtcMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
  const last7  = checkIns.filter(c => toUtcMs(c.class_date) >= now - 7  * 86400000).length;
  const last30 = checkIns.filter(c => toUtcMs(c.class_date) >= now - 30 * 86400000).length;
  const lastVisit = checkIns[0]?.class_date
    ? formatDateTz(new Date(`${checkIns[0].class_date}T00:00:00Z`), gymProfile.timezone)
    : "—";

  const freq: Record<string, number> = {};
  checkIns.forEach(c => { freq[c.class_name] = (freq[c.class_name] ?? 0) + 1; });
  const favorite = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const metrics = [
    { label: "Classes (7d)",  value: String(last7) },
    { label: "Classes (30d)", value: String(last30) },
    { label: "Last Class",    value: lastVisit },
    { label: "Favorite",      value: favorite },
  ];

  // Build membership timeline sorted most-recent first
  const sortedMemberships = [...memberships].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  function fmtDate(d: string | null) {
    if (!d) return null;
    return formatDateTz(d, gymProfile.timezone);
  }

  return (
    <div className="space-y-8">

      {/* ── Membership History ── */}
      {sortedMemberships.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">Membership History</h3>
          <div>
            {sortedMemberships.map((m, i) => {
              const cfg = MEMBERSHIP_TIMELINE_CONFIG[m.status];
              const planName = m.membership_plans?.name ?? m.plan_name ?? "Membership";
              const endDate  = m.canceled_at ?? m.ends_at;
              const isLast   = i === sortedMemberships.length - 1;
              const isFirst  = i === 0; // most recent

              // "Rejoined" if there's a gap — i.e. previous entry (lower index = more recent) was canceled
              const prevMs = i > 0 ? sortedMemberships[i - 1] : null;
              const wasGap = prevMs && (prevMs.status === "canceled" || prevMs.status === "past_due");
              const eventLabel = wasGap ? "Rejoined" : isFirst && sortedMemberships.length === 1 ? "Joined" : isLast ? "Joined" : "Renewed";

              return (
                <div key={m.id} className="flex gap-3">
                  {/* Track */}
                  <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                    <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                    {!isLast && <div className="w-px flex-1 bg-line mt-1 mb-0" style={{ minHeight: 28 }} />}
                  </div>

                  {/* Content */}
                  <div className="pb-5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${cfg.labelColor}`}>{cfg.label}</span>
                      <span className="text-sm text-ink">— {planName}</span>
                    </div>
                    <div className="text-xs text-muted mt-0.5 space-y-0.5">
                      <div>{eventLabel} {fmtDate(m.started_at)}</div>
                      {endDate && <div>Ended {fmtDate(endDate)}</div>}
                      {m.status === "paused" && m.paused_until && (
                        <div>Paused until {fmtDate(m.paused_until)}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Class Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="border border-line rounded-lg p-4 text-center">
            <div className="font-display text-2xl text-black dark:text-ink truncate">{m.value}</div>
            <div className="text-xs text-muted mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* ── Recent Classes ── */}
      {checkIns.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Recent Classes</h3>
          <CheckInsList
            checkIns={checkIns}
            totalLifetime={checkIns.length}
            rowCap={50}
            emptyText="No classes attended yet."
          />
        </div>
      )}

      {checkIns.length === 0 && memberships.length === 0 && (
        <p className="text-sm text-muted">No activity yet.</p>
      )}
    </div>
  );
}
