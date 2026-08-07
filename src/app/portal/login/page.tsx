"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useGymProfile } from "@/lib/gym-profile-context";
import { SpinnerButton } from "@/components/ui/Spinner";
import Link from "next/link";

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const t = useTranslations("portal.login");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Read the credentials from the submitted form, not from React state — the
    // inputs are deliberately uncontrolled so React can't clear a password
    // manager's autofill during hydration. This form is the most exposed of the
    // three: its autoComplete hints ("email" / "current-password") actively
    // invite that autofill. See the admin login for the full explanation.
    const fd = new FormData(e.target as HTMLFormElement);
    const emailValue = ((fd.get("email") as string) ?? "").trim();
    const passwordValue = (fd.get("password") as string) ?? "";

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password: passwordValue,
    });
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setError(t("emailNotConfirmed"));
      } else {
        // Supabase's own message, and it arrives in English ("Invalid login
        // credentials"). Left verbatim rather than mapped: the set of codes is
        // Supabase's to change, and inventing a Spanish catch-all here would
        // turn a precise cause into "algo salió mal". Translating these means
        // matching on `error.code`, which is a separate piece of work.
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError(t("noSession"));
      setLoading(false);
      return;
    }

    sessionStorage.setItem("session_started_at", String(Date.now()));
    // Full page navigation ensures middleware picks up the new auth cookies
    window.location.href = "/portal";
  }

  return (
    <>
      {urlError === "confirmation_failed" && (
        <p className="text-sm text-danger bg-danger-light border border-danger-border rounded px-3 py-2 mb-4">
          {t("confirmationFailed")}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
            {t("email")}
          </label>
          {/* Uncontrolled on purpose — see handleSubmit. A `value` prop makes
              React clear a password manager's pre-hydration autofill. */}
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
            placeholder="tu@correo.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide">
              {t("password")}
            </label>
            <Link href="/portal/forgot-password" className="text-xs text-muted hover:text-black dark:hover:text-ink underline underline-offset-2 transition-colors">
              {t("forgot")}
            </Link>
          </div>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-light border border-danger-border rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-black text-white dark:bg-yellow dark:text-black rounded font-semibold text-sm hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-50 transition-colors"
        >
          {loading ? <SpinnerButton label={t("submitting")} /> : t("submit")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {t("newMember")}{" "}
        <Link href="/join" className="text-black dark:text-ink underline underline-offset-2 hover:opacity-70">
          {t("joinHere")}
        </Link>
      </p>

      <div className="mt-4 pt-4 border-t border-line text-center">
        <Link
          href="/"
          className="text-sm text-muted hover:text-ink transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />{t("backToSite")}
        </Link>
      </div>
    </>
  );
}

export default function PortalLoginPage() {
  const profile = useGymProfile();
  const t = useTranslations("portal.login");
  return (
    <div className="min-h-screen bg-off-white flex items-start justify-center">
      <div className="max-w-sm mx-auto mt-16 w-full p-8 bg-white dark:bg-portal-card border border-line rounded-lg shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-yellow to-blue-mid to-purple-light -mx-8 -mt-8 mb-8 rounded-t-lg" style={{ width: "calc(100% + 4rem)" }} />

        <div className="text-center mb-6">
          <div className="font-display text-2xl text-black dark:text-ink tracking-tight">{profile.logoText} &bull; {profile.cityName.toUpperCase()}</div>
          <div className="text-sm text-muted mt-1">{t("subtitle")}</div>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
