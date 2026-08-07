"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { addSubscriber } from "@/lib/actions/subscribe";
import Button from "@/components/ui/Button";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

export default function SubscribeForm({ sectionConfig }: Props) {
  const [mode, setMode] = useState<"email" | "sms">("email");
  const [value, setValue] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const title = sectionConfig?.display_title ?? "Mantente al tanto";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const result = await addSubscriber(value, mode, honeypot);
    if (result.success) {
      setStatus("success");
      setValue("");
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Algo salió mal. Intenta de nuevo.");
    }
  }

  return (
    <section id="subscribe" className="bg-soul-dark py-16 nav:py-20 px-5 nav:px-12">
      <div className="max-w-[620px] mx-auto text-center">
        <h2 className="text-[clamp(38px,5vw,60px)] text-off-white mb-3">
          {title}
        </h2>
        <p className="text-[15px] text-white/50 mb-9">
          Cambios de horario, eventos, seminarios y noticias de la academia —
          directo a tu correo o teléfono.
        </p>

        {/* Email / SMS tabs */}
        <div className="flex border border-white/15 rounded overflow-hidden w-fit mx-auto mb-7">
          {(["email", "sms"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setValue(""); setStatus("idle"); }}
              className={`px-6 py-2.5 text-[13px] font-semibold transition-all duration-150 border-r border-white/10 last:border-r-0 cursor-pointer font-body ${
                mode === m ? "bg-yellow text-black" : "bg-transparent text-white/50 hover:text-white"
              }`}
            >
              {m === "email" ? "Correo" : "SMS"}
            </button>
          ))}
        </div>

        {status === "success" ? (
          <div className="text-white/70 py-4">
            <CheckCircle className="inline w-4 h-4 text-success mr-1 align-text-bottom" /> ¡Listo! Te enviaremos{" "}
            {mode === "sms" ? "mensajes" : "correos"} a{" "}
            <strong className="text-white">{value || "tu contacto"}</strong>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            {/* Honeypot — hidden from real users, bots fill it in */}
            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              style={{ display: "none" }}
            />
            <label htmlFor="subscribe-input" className="sr-only">
              {mode === "sms" ? "Número de teléfono" : "Correo electrónico"}
            </label>
            <input
              id="subscribe-input"
              name={mode === "sms" ? "phone" : "email"}
              type={mode === "sms" ? "tel" : "email"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === "sms" ? "8888 8888" : "tu@correo.com"}
              required
              autoComplete={mode === "sms" ? "tel" : "email"}
              className="flex-1 bg-white/[0.06] border border-white/15 text-white placeholder-white/30 px-4 py-2.5 rounded text-sm font-body outline-none focus:border-yellow focus:ring-2 focus:ring-[#e6b323]/25 transition-colors duration-150"
            />
            <Button
              variant="yellow"
              type="submit"
              disabled={status === "loading"}
            >
              {status === "loading" ? "…" : "Suscribirme"}
            </Button>
          </form>
        )}

        {status === "error" && (
          <p className="text-sm text-danger mt-2">{errorMsg}</p>
        )}

        <p className="text-xs text-white/30 mt-4">
          Sin spam. Cancela cuando quieras. Solo enviamos avisos reales.
        </p>
      </div>
    </section>
  );
}
