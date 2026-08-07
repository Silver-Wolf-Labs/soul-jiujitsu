"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGymProfile } from "@/lib/gym-profile-context";

export default function ResetPasswordPage() {
  const profile = useGymProfile();
  const router = useRouter();
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [status, setStatus]         = useState<"idle" | "saving" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg]     = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase sends the member here with the recovery tokens in the URL FRAGMENT:
  //
  //   /portal/reset-password#access_token=…&refresh_token=…&type=recovery
  //
  // This page used to wait for a PASSWORD_RECOVERY event and nothing else, which
  // never arrived: `createBrowserClient` from @supabase/ssr is cookie-backed and
  // does not implicitly consume an implicit-flow fragment the way the older
  // localStorage client did. Verified against a real recovery link — the page sat
  // on "Verifying your reset link…" indefinitely, with no error and no form, so
  // the reset was impossible to complete. That is the bug.
  //
  // The fix is to stop waiting and establish the session explicitly from the
  // fragment via setSession(). The event listener stays as a fast path for the
  // case where the SDK does get there first.
  useEffect(() => {
    const supabase = createClient();
    let done = false;
    const ready = () => { if (!done) { done = true; setSessionReady(true); } };
    const fail = () => {
      if (done) return;
      done = true;
      setErrorMsg("This reset link is invalid or has expired. Please request a new one.");
      setStatus("error");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") ready();
    });

    const params = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, ""),
    );
    const access_token  = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    // `type=recovery` is what distinguishes "arrived from a reset email" from
    // "already signed in and navigated here". Without that check, an attacker at
    // an unlocked, logged-in browser could set a new password without knowing the
    // current one — so a bare visit must NOT be treated as a verified link.
    const isRecovery = params.get("type") === "recovery";

    if (isRecovery && access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) fail();
          else {
            // Drop the tokens from the address bar once they're exchanged, so a
            // copied URL, a shared screen, or the browser history doesn't carry a
            // live credential.
            window.history.replaceState(null, "", window.location.pathname);
            ready();
          }
        })
        .catch(fail);
    } else {
      // Supabase also supports a `?code=` PKCE variant that /auth/callback
      // exchanges before redirecting here; in that case a session already
      // exists and there is no fragment to read.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session && params.get("code")) ready();
        else fail();
      });
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 10) {
      setErrorMsg("Password must be at least 10 characters. Longer passwords are stronger than shorter ones with special characters.");
      return;
    }
    if (password !== confirm) { setErrorMsg("Passwords do not match."); return; }

    setStatus("saving");

    // HIBP breach check — reject known-breached passwords outright.
    // Fails open on network error (see src/lib/auth/hibp.ts).
    try {
      const { validatePassword } = await import("@/lib/actions/password-validation");
      const check = await validatePassword(password);
      if (!check.ok) {
        setErrorMsg(check.message);
        setStatus("error");
        return;
      }
    } catch {
      // Validation service hiccup — fall through to Supabase update.
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
    } else {
      setStatus("done");
      setTimeout(() => router.push("/portal"), 2000);
    }
  }

  // A bad or expired link has to be a dead end with a way out, not a spinner.
  // This is the branch that was unreachable before: the page could only ever be
  // "verifying" or "verified", so a link that didn't verify spun forever.
  if (!sessionReady && status === "error") {
    return (
      <div className="min-h-screen bg-off-white flex items-start justify-center px-4">
        <div className="max-w-sm mx-auto mt-16 w-full p-8 bg-white dark:bg-portal-card border border-line rounded-lg shadow-sm text-center">
          <div className="font-display text-2xl text-black dark:text-ink tracking-tight">
            {profile.logoText} &bull; {profile.cityName.toUpperCase()}
          </div>
          <p className="text-sm text-danger bg-danger-light border border-danger-border rounded px-3 py-2 mt-6">
            {errorMsg}
          </p>
          <Link
            href="/portal/forgot-password"
            className="mt-6 block w-full py-2.5 bg-black text-white dark:bg-yellow dark:text-black rounded font-semibold text-sm hover:bg-near-black dark:hover:bg-yellow-deep transition-colors"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center px-4">
        <div className="text-sm text-muted text-center space-y-2">
          <div className="animate-spin w-5 h-5 border-2 border-black/10 border-t-black dark:border-ink/10 dark:border-t-ink rounded-full mx-auto" />
          <p>Verifying your reset link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white flex items-start justify-center px-4">
      <div className="max-w-sm mx-auto mt-16 w-full p-8 bg-white dark:bg-portal-card border border-line rounded-lg shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-yellow to-blue-mid to-purple-light -mx-8 -mt-8 mb-8 rounded-t-lg" style={{ width: "calc(100% + 4rem)" }} />

        <div className="text-center mb-6">
          <div className="font-display text-2xl text-black dark:text-ink tracking-tight">{profile.logoText} &bull; {profile.cityName.toUpperCase()}</div>
          <div className="text-sm text-muted mt-1">Set New Password</div>
        </div>

        {status === "done" ? (
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-success-light border border-success-border flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-ink font-semibold">Password updated!</p>
            <p className="text-xs text-muted">Redirecting to your portal…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
                placeholder="Min. 10 characters — passphrase preferred"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-yellow"
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>

            {(status === "error" || errorMsg) && (
              <p className="text-sm text-danger bg-danger-light border border-danger-border rounded px-3 py-2">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "saving"}
              className="w-full py-2.5 bg-black text-white dark:bg-yellow dark:text-black rounded font-semibold text-sm hover:bg-near-black dark:hover:bg-yellow-deep disabled:opacity-50 transition-colors"
            >
              {status === "saving" ? "Saving…" : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
