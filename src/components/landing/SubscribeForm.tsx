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
  // Typo correction from the deliverability gate. Held here rather than
  // auto-applied: this is a one-shot form, so a wrong "correction" would
  // silently subscribe someone else's address with no chance to undo.
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const title = sectionConfig?.display_title ?? "Mantente al tanto";

  /**
   * `resolved` is true when the subscriber has already answered a suggestion
   * prompt, which tells the action to accept the address as given.
   */
  async function submit(address: string, resolved: boolean) {
    setStatus("loading");
    setErrorMsg("");

    const result = await addSubscriber(address, mode, honeypot, resolved);

    if (result.success) {
      setSuggestion(null);
      setStatus("success");
      setValue("");
      return;
    }

    // A suggestion with no error message means "confirm this first", not
    // "something went wrong" — so return to idle and let the prompt render.
    if (result.suggestion) {
      setSuggestion(result.suggestion);
      setStatus("idle");
      return;
    }

    setStatus("error");
    setErrorMsg(result.error ?? "Algo salió mal. Intenta de nuevo.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A submit while a prompt is showing means the subscriber left the address
    // as typed and pressed the button again — treat that as confirmation.
    await submit(value, suggestion !== null);
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
              onClick={() => { setMode(m); setValue(""); setStatus("idle"); setSuggestion(null); }}
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

        {/* Typo prompt. Accepting subscribes the corrected address immediately —
            one click, since the subscriber has already stated their intent by
            submitting. Declining leaves the field untouched so the next press of
            "Suscribirme" goes through as typed. */}
        {suggestion && status !== "success" && (
          <p role="alert" className="text-sm text-white/70 mt-3">
            ¿Quisiste decir{" "}
            <button
              type="button"
              onClick={() => { setValue(suggestion); submit(suggestion, true); }}
              className="font-semibold text-yellow underline hover:text-yellow-deep"
            >
              {suggestion}
            </button>
            ?{" "}
            <button
              type="button"
              onClick={() => submit(value, true)}
              className="text-white/40 underline hover:text-white/70"
            >
              No, usar el que escribí
            </button>
          </p>
        )}

        <p className="text-xs text-white/30 mt-4">
          Sin spam. Cancela cuando quieras. Solo enviamos avisos reales.
        </p>
      </div>
    </section>
  );
}
