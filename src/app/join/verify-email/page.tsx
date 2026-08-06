import Link from "next/link";
import { MailCheck } from "lucide-react";

interface Props {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const sp = await searchParams;
  const email = sp.email ?? "your inbox";

  return (
    <div className="min-h-screen bg-off-white flex flex-col items-center justify-start py-16 px-4">
      <div className="max-w-md w-full mx-auto bg-white border border-line rounded-lg shadow-sm overflow-hidden">
        {/* Accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-yellow to-blue-mid to-purple-light" />

        <div className="p-8 text-center">
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-full bg-off-white border border-line flex items-center justify-center">
              <MailCheck className="w-7 h-7 text-ink" />
            </div>
          </div>

          <h1 className="font-display text-2xl text-black tracking-wide mb-2">
            Check your email
          </h1>
          <p className="text-sm text-muted mb-4">
            We sent a verification link to{" "}
            {sp.email ? (
              <span className="font-semibold text-ink">{email}</span>
            ) : (
              "your email address"
            )}
            .
          </p>
          <p className="text-sm text-muted mb-8">
            Click the link in the email to activate your account. Once confirmed
            you can sign in and access your member portal.
          </p>

          <div className="border-t border-line pt-6 space-y-3">
            <p className="text-xs text-muted">Already confirmed?</p>
            <Link
              href="/portal/login"
              className="block w-full py-2.5 bg-black text-white rounded font-semibold text-sm hover:bg-near-black transition-colors text-center"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
