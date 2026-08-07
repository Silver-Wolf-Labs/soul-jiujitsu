"use server";

/**
 * Pre-send email gate. Every flow that causes Supabase Auth to send mail
 * must call this first.
 *
 * Three layers, cheapest first:
 *   1. Syntax + reserved/fixture domains (`@/lib/email/deliverability`) —
 *      pure, no I/O.
 *   2. Suppression list (`email_suppressions`) — an address that already
 *      hard-bounced or filed a complaint must never be mailed again. The
 *      table has existed since the p0-hardening migration but nothing read
 *      from it, so every retry to a dead address re-bounced and compounded
 *      the project's bounce rate.
 *   3. MX / A / AAAA lookup (`@/lib/email/mx`) — catches well-formed
 *      domains that cannot receive mail at all.
 *
 * Mirrors `password-validation.ts`: a server action returning a plain
 * result object, called from the client before the auth call. It is
 * advisory by construction — it cannot stop a direct GoTrue call — so it
 * belongs at every call site rather than in one wrapper.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { checkEmailAddress } from "@/lib/email/deliverability";
import { domainAcceptsMail } from "@/lib/email/mx";
import { log } from "@/lib/log";

export type EmailGateResult =
  | { ok: true; email: string; suggestion: string | null }
  | { ok: false; reason: string; message: string };

/**
 * Validate `rawEmail` before it is handed to a mailer.
 *
 * On success returns the normalized address plus a typo suggestion when the
 * domain is one edit away from a common provider. The suggestion is advice
 * for the UI to surface — never applied silently, since an unusual domain
 * can still be exactly what the member meant.
 */
export async function checkEmailDeliverability(
  rawEmail: string
): Promise<EmailGateResult> {
  const syntax = checkEmailAddress(rawEmail);
  if (!syntax.ok) {
    return { ok: false, reason: syntax.reason, message: syntax.message };
  }

  const email = syntax.email;
  const domain = email.slice(email.lastIndexOf("@") + 1);

  // ── Suppression list ──────────────────────────────────────────────────
  // Service role: RLS on email_suppressions only admits admins, and this
  // runs for anonymous visitors on the signup path.
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("email_suppressions")
      .select("reason, bounce_type")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      // Transient bounces (a full mailbox, a temporary server failure) clear
      // up on their own, so they must not permanently lock someone out of
      // signing up. Only permanent bounces and complaints block.
      const isTransient = data.bounce_type === "Transient";

      if (!isTransient) {
        log.warn("email gate: address is suppressed", {
          domain,
          reason: data.reason,
          bounceType: data.bounce_type,
        });
        return {
          ok: false,
          reason: "suppressed",
          message:
            "No podemos enviar correo a esa dirección porque rebotó " +
            "anteriormente. Usa otra dirección o escríbenos para " +
            "reactivarla.",
        };
      }
    }
  } catch (err) {
    // A failure to read the suppression table must not block signups —
    // same fail-open reasoning as the DNS and HIBP checks. Logged so the
    // gap is visible rather than silent.
    log.warn("email gate: suppression lookup failed, failing open", {
      domain,
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  // ── DNS ───────────────────────────────────────────────────────────────
  const mx = await domainAcceptsMail(domain);
  if (!mx.deliverable) {
    log.warn("email gate: domain has no mail route", { domain });
    return {
      ok: false,
      reason: "no_mx",
      message:
        `El dominio ${domain} no puede recibir correo. Revisa que esté ` +
        "bien escrito.",
    };
  }

  return { ok: true, email, suggestion: syntax.suggestion };
}
