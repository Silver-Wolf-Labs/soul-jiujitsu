"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { checkEmailDeliverability } from "@/lib/actions/email-deliverability";
import { useGymProfile } from "@/lib/gym-profile-context";
import { SpinnerButton } from "@/components/ui/Spinner";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const profile = useGymProfile();
  const t = useTranslations("portal.forgotPassword");
  const [email, setEmail]     = useState("");
  const [status, setStatus]   = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    // Deliverability gate before the send. A reset request is trivially easy
    // to point at a dead address — this form takes any input and Supabase
    // mails it, so typos and reserved domains land as hard bounces against
    // the project's sending reputation.
    //
    // Account existence is NOT what this checks, and it must not become that:
    // the "sent" state below is deliberately shown whether or not the address
    // is registered, so the form never discloses who has an account. A refusal
    // here says only that the ADDRESS ITSELF cannot receive mail — true
    // regardless of whether an account exists behind it.
    const gate = await checkEmailDeliverability(email);
    if (!gate.ok) {
      setErrorMsg(gate.message);
      setStatus("error");
      return;
    }

    const supabase = createClient();
    // Prefer window.location.origin over the build-time env var — see
    // JoinForm.tsx for the full rationale. The link embedded in the
    // reset email itself is built from Supabase's dashboard Site URL,
    // so if reset emails still point to localhost the dashboard value
    // must be corrected (Auth → URL Configuration).
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "";
    // `gate.email` is already trimmed + lowercased by the gate.
    const { error } = await supabase.auth.resetPasswordForEmail(gate.email, {
      redirectTo: `${origin}/portal/reset-password`,
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="min-h-screen bg-off-white flex items-start justify-center px-4">
      <div className="max-w-sm mx-auto mt-16 w-full p-8 bg-white dark:bg-portal-card border border-line rounded-lg shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-yellow to-blue-mid to-purple-light -mx-8 -mt-8 mb-8 rounded-t-lg" style={{ width: "calc(100% + 4rem)" }} />

        <div className="text-center mb-6">
          <div className="font-display text-2xl text-black dark:text-ink tracking-tight">{profile.logoText} &bull; {profile.cityName.toUpperCase()}</div>
          <div className="text-sm text-muted mt-1">{t("subtitle")}</div>
        </div>

        {status === "sent" ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-success-light border border-success-border flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-ink">
              {t.rich("sentTitle", {
                email,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <p className="text-xs text-muted">{t("sentExpiry")}</p>
            <Link href="/portal/login" className="block text-sm text-black dark:text-ink underline underline-offset-2 hover:opacity-70 mt-4">
              {t("backToSignIn")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted">{t("intro")}</p>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">{t("email")}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
                placeholder="tu@correo.com"
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-danger bg-danger-light border border-danger-border rounded px-3 py-2">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full py-2.5 bg-black text-white dark:bg-yellow dark:text-black rounded font-semibold text-sm hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-50 transition-colors"
            >
              {status === "sending" ? <SpinnerButton label={t("submitting")} /> : t("submit")}
            </button>

            <p className="text-center text-sm text-muted">
              <Link href="/portal/login" className="text-black dark:text-ink underline underline-offset-2 hover:opacity-70">
                {t("backToSignIn")}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
