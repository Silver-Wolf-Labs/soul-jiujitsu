import Link from "next/link";
import { MailCheck } from "lucide-react";

interface Props {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const sp = await searchParams;
  const email = sp.email ?? "tu correo";

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
            Revisa tu correo
          </h1>
          <p className="text-sm text-muted mb-4">
            Enviamos un enlace de verificación a{" "}
            {sp.email ? (
              <span className="font-semibold text-ink">{email}</span>
            ) : (
              "tu correo electrónico"
            )}
            .
          </p>
          <p className="text-sm text-muted mb-8">
            Haz clic en el enlace del correo para activar tu cuenta. Una vez
            confirmada podrás iniciar sesión y entrar a tu portal de miembro.
          </p>

          <div className="border-t border-line pt-6 space-y-3">
            <p className="text-xs text-muted">¿Ya confirmaste?</p>
            <Link
              href="/portal/login"
              className="block w-full py-2.5 bg-black text-white rounded font-semibold text-sm hover:bg-near-black transition-colors text-center"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
