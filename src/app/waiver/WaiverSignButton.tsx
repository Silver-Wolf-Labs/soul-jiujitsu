"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signWaiver } from "@/lib/actions/waivers";
import { SpinnerButton } from "@/components/ui/Spinner";
import { SignatureCanvas, SignatureCanvasHandle } from "@/components/signature/SignatureCanvas";
import { SignaturePadModal } from "@/components/signature/SignaturePadModal";

type SignMethod = "typed" | "drawn";

interface Props {
  templateId: number;
  firstName: string;
  lastName: string;
  /**
   * Waiver body content. Rendered inside the scrollable container so we can
   * gate the agreement checkbox on the reader actually reaching the bottom.
   * Passed as children (not a plain prop) so the server can still render the
   * markdown and ship it as RSC payload — no client-side markdown parsing.
   */
  children: React.ReactNode;
}

/**
 * Combined scrollable waiver body + signing UI.
 *
 * Historically this component rendered only the sign button, while the body
 * lived in the parent `page.tsx`. That split made it impossible to gate the
 * agreement checkbox on scroll position — the scroll container was in one
 * tree and the checkbox state was in another. Fixing this meant either
 * lifting scroll state into a context or combining them. Combining is
 * simpler and the two are always shown together on /waiver anyway.
 */
export default function WaiverSignButton({
  templateId,
  firstName,
  lastName,
  children,
}: Props) {
  const router = useRouter();

  // ── Scroll gate ────────────────────────────────────────────────────────
  // Users must scroll to the end before they can agree. Matches the signup
  // flow in JoinForm so the two paths behave consistently.
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  function handleBodyScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // 10px slack: mobile browsers often report a scrollTop 1–2px short of the
    // true bottom after momentum scroll settles. Anything within 10px counts.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setHasScrolledToEnd(true);
    }
  }

  // Signing method tabs
  const [method, setMethod] = useState<SignMethod>("typed");

  // Auto-generated initials from member name
  const requiredInitials = `${firstName.charAt(0).toUpperCase()}.${lastName.charAt(0).toUpperCase()}.`;

  // Drawn signature state
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [confirmedDataUrl, setConfirmedDataUrl] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);

  // Submission state
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether the current method has a valid signature
  const hasTyped = method === "typed" && requiredInitials.length > 0;
  const hasDrawn = method === "drawn" && (confirmedDataUrl !== null || !canvasEmpty);
  const hasSignature = hasTyped || hasDrawn;
  const canSubmit = hasScrolledToEnd && agreed && hasSignature && !signing;

  const handleModalConfirm = (dataUrl: string) => {
    setConfirmedDataUrl(dataUrl);
    setShowModal(false);
  };

  const handleClearDrawn = () => {
    canvasRef.current?.clear();
    setCanvasEmpty(true);
    setConfirmedDataUrl(null);
  };

  const handleMethodChange = (m: SignMethod) => {
    setMethod(m);
    setError(null);
  };

  async function handleSign() {
    if (!canSubmit) return;
    setSigning(true);
    setError(null);

    try {
      let result;

      if (method === "typed") {
        result = await signWaiver(templateId, { type: "typed", initials: requiredInitials });
      } else {
        // Prefer the fullscreen-confirmed image; fall back to inline canvas
        const dataUrl = confirmedDataUrl ?? canvasRef.current?.toDataURL() ?? "";
        if (!dataUrl) {
          setError("Please draw your signature before continuing.");
          return;
        }
        result = await signWaiver(templateId, { type: "drawn", dataUrl });
      }

      if ("error" in result) {
        setError(result.error);
        return;
      }

      // Success — refresh the server components so middleware sees the new
      // waiver_signed_at on the next request, then push to /portal. Without
      // router.refresh() the cached RSC payload can keep the user bouncing
      // back to /waiver on navigation.
      router.refresh();
      router.push("/portal");
    } catch (e) {
      // Server actions that throw (network error, unhandled exception in the
      // RPC, etc.) otherwise leave the user staring at a spinner that resets
      // with no feedback. Surface the error instead of swallowing it.
      console.error("[WaiverSignButton] handleSign threw:", e);
      setError(
        e instanceof Error
          ? `Failed to record signature: ${e.message}`
          : "Failed to record signature. Please try again."
      );
    } finally {
      setSigning(false);
    }
  }

  return (
    <>
      {showModal && (
        <SignaturePadModal
          onConfirm={handleModalConfirm}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── Scrollable waiver body ─────────────────────────────────────── */}
      <div className="px-6 py-5">
        <div
          onScroll={handleBodyScroll}
          className="max-h-96 overflow-y-auto border border-line rounded p-4 prose prose-sm max-w-none text-ink"
        >
          {children}
        </div>
        {!hasScrolledToEnd && (
          <p className="mt-2 text-xs text-muted text-center">
            Scroll to the end of the waiver to enable signing.
          </p>
        )}
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* ── Method tabs ─────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Signature method
          </p>
          <div className="flex rounded border border-line overflow-hidden">
            {(["typed", "drawn"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMethodChange(m)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  method === m
                    ? "bg-black text-white"
                    : "bg-white text-ink hover:bg-off-white"
                }`}
              >
                {m === "typed" ? "Type initials" : "Draw signature"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Typed initials ──────────────────────────────────────────── */}
        {method === "typed" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">
              Your initials
            </label>
            <div className="w-full border border-line rounded px-3 py-3 text-2xl font-semibold tracking-[0.3em] text-black bg-off-white text-center select-none">
              {requiredInitials}
            </div>
            <p className="text-xs text-muted">
              Initials are generated from your legal name on file. By checking the agreement box below, you confirm these as your signature.
            </p>
          </div>
        )}

        {/* ── Drawn signature ─────────────────────────────────────────── */}
        {method === "drawn" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink">Your signature</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearDrawn}
                  className="text-xs text-muted hover:text-ink transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-1 text-xs font-medium text-black border border-line rounded px-2.5 py-1 hover:bg-off-white transition-colors"
                >
                  {/* Expand icon */}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Full screen
                </button>
              </div>
            </div>

            {/* Inline canvas — shows confirmed image or live drawing surface */}
            {confirmedDataUrl ? (
              <div className="relative border border-line rounded-lg overflow-hidden bg-white">
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
                  onChange={setCanvasEmpty}
                />
                {canvasEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <p className="text-line text-sm">Sign here with your finger or mouse</p>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-muted">
              Tip: tap{" "}
              <strong className="font-medium text-ink">Full screen</strong> for a
              larger signing area — useful on phones.
            </p>
          </div>
        )}

        {/* ── Agreement checkbox ──────────────────────────────────────── */}
        <label
          className={`flex items-start gap-3 group ${
            hasScrolledToEnd ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
        >
          <input
            type="checkbox"
            checked={agreed}
            disabled={!hasScrolledToEnd}
            onChange={(e) => hasScrolledToEnd && setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-line accent-black flex-shrink-0 disabled:cursor-not-allowed"
          />
          <span className="text-sm text-ink group-hover:text-black transition-colors">
            I have read and agree to all terms above
          </span>
        </label>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && <p className="text-sm text-danger">{error}</p>}

        {/* ── Submit ──────────────────────────────────────────────────── */}
        <button
          onClick={handleSign}
          disabled={!canSubmit}
          className="w-full bg-black text-white text-sm font-semibold py-3 rounded hover:bg-near-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {signing ? <SpinnerButton label="Signing" /> : "Sign & Continue"}
        </button>

        {!hasSignature && agreed && (
          <p className="text-xs text-center text-muted">
            Draw your signature above to continue.
          </p>
        )}
      </div>
    </>
  );
}
