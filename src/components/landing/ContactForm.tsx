"use client";

import { useRef, useState } from "react";
import { CheckCircle } from "lucide-react";
import { submitContact } from "@/lib/actions/contact";
import FormField from "@/components/ui/FormField";
import Button from "@/components/ui/Button";

export default function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);
    const result = await submitContact(formData);

    if (result.success) {
      setStatus("success");
      (e.target as HTMLFormElement).reset();
      // Keep the user's scroll position on the success message
      requestAnimationFrame(() => {
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Something went wrong.");
    }
  }

  return (
    <div ref={containerRef}>
      <h3 className="font-display text-[36px] text-black mb-1.5">Send Us a Message</h3>
      <p className="text-[14px] text-muted mb-7">
        Questions about classes, pricing, or anything else — we&apos;re friendly, we promise.
      </p>

      {status === "success" ? (
        <div className="bg-success-light border border-success-border rounded-lg p-6 text-center">
          <div className="flex justify-center mb-2"><CheckCircle className="w-8 h-8 text-success" /></div>
          <p className="text-base font-semibold text-ink mb-1">Message sent!</p>
          <p className="text-sm text-muted">We&apos;ll get back to you soon.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Honeypot — hidden from real users, bots fill it in */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ display: "none" }} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="First Name" name="first_name" type="text" placeholder="Rob" required autoComplete="given-name" />
            <FormField label="Last Name" name="last_name" type="text" placeholder="Ables" required autoComplete="family-name" />
          </div>
          <FormField label="Email" name="email" type="email" placeholder="you@email.com" required autoComplete="email" />
          <FormField label="Message" name="message" multiline placeholder="Ask us anything…" required />

          {status === "error" && (
            <p className="text-sm text-danger">{errorMsg}</p>
          )}

          <Button
            variant="primary"
            type="submit"
            disabled={status === "loading"}
            className="w-full nav:w-auto"
          >
            {status === "loading" ? "Sending…" : "Send Message"}
          </Button>
        </form>
      )}
    </div>
  );
}
