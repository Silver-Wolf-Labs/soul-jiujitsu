"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { superAdminLogin } from "./actions";

export default function SuperAdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await superAdminLogin(password);
      if (result.success) {
        router.push("/super-admin");
      } else {
        setError(result.error || "Login failed.");
        setPassword("");
      }
    });
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-white/10 mb-4">
            <svg
              className="w-7 h-7 text-yellow"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-display text-white tracking-wider">
            PLATFORM ADMIN
          </h1>
          <p className="text-sm text-white/40 mt-1 font-body">
            Restricted access &middot; Authorized personnel only
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="one-time-code"
              autoFocus
              required
              disabled={isPending}
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white
                         placeholder:text-white/20 focus:outline-none focus:border-yellow/50
                         focus:ring-1 focus:ring-yellow/30 transition-colors disabled:opacity-50"
              placeholder="Enter platform password"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || !password}
            className="w-full py-3 rounded-lg bg-yellow text-black font-semibold text-sm
                       hover:bg-yellow-light transition-colors disabled:opacity-50
                       disabled:cursor-not-allowed"
          >
            {isPending ? "Authenticating..." : "Access Platform Admin"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-white/20 mt-8">
          Session expires after 1 hour of inactivity.
          <br />
          All access attempts are logged.
        </p>
      </div>
    </div>
  );
}
