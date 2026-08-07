"use client";

import { useEffect, useState } from "react";
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

  // Supabase Auth redirects with token in URL hash; exchange it for a session
  useEffect(() => {
    const supabase = createClient();
    // Listen for the PASSWORD_RECOVERY event — Supabase fires it automatically
    // when the page loads with a valid recovery token in the URL hash.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setSessionReady(true);
    });
    return () => subscription.unsubscribe();
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
