"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SpinnerButton } from "@/components/ui/Spinner";
import { useGymProfile } from "@/lib/gym-profile-context";

export default function AdminLoginPage() {
  const profile = useGymProfile();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message === "Invalid login credentials"
        ? "Invalid email or password."
        : authError.message);
      setLoading(false);
      return;
    }

    // Verify the session was actually established before navigating.
    // signInWithPassword can return success without properly setting cookies
    // in some edge cases with @supabase/ssr.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Login succeeded but session could not be established. Please try again.");
      setLoading(false);
      return;
    }

    sessionStorage.setItem("session_started_at", String(Date.now()));
    // Full page navigation ensures middleware picks up the new auth cookies
    window.location.href = "/admin";
  }

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-display text-3xl text-black mb-1">
            {profile.logoText}{" "}
            <span className="text-yellow">{profile.logoDot}</span> {profile.cityName}
          </div>
          <p className="text-sm text-muted">Admin Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-line rounded-lg p-8 shadow-sm">
          <h1 className="font-display text-2xl text-black mb-6">Sign In</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold tracking-wider uppercase text-muted mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                className="w-full bg-off-white border border-line text-ink px-3.5 py-2.5 rounded text-sm outline-none focus:border-blue-mid focus:ring-2 focus:ring-blue-mid/10 transition-colors"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold tracking-wider uppercase text-muted mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="off"
                className="w-full bg-off-white border border-line text-ink px-3.5 py-2.5 rounded text-sm outline-none focus:border-blue-mid focus:ring-2 focus:ring-blue-mid/10 transition-colors"
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
              className="w-full bg-black text-white py-3 rounded text-sm font-bold tracking-wider uppercase hover:bg-near-black transition-colors disabled:opacity-60 cursor-pointer font-body"
            >
              {loading ? <SpinnerButton label="Signing in" /> : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted mt-4">
          <Link href="/" className="hover:text-ink transition-colors inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />Back to site</Link>
        </p>
      </div>
    </div>
  );
}
