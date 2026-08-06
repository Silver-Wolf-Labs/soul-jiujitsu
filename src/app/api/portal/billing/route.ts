/**
 * Stripe Customer Portal session creator.
 *
 * Self-serve billing for members — cancel subscription (at period
 * end), update payment method, view invoices. Stripe hosts the portal
 * UI; we just create a time-limited session and redirect. PCI-
 * compliant, accessibility-audited, localized, tax-aware — all for
 * free because it's Stripe's surface, not ours.
 *
 * Security notes:
 *   - Authenticated session required (getUser). Anonymous GET → bounce
 *     to /portal/login.
 *   - Origin check: reject requests with a Referer/Origin that isn't
 *     our own. Prevents an iframe on an attacker site from silently
 *     redirecting a logged-in member into their Stripe portal.
 *     (Low-severity — Stripe requires re-auth for destructive actions
 *     anyway — but defense-in-depth is cheap here.)
 *   - Stale customer id handling: if Stripe says `resource_missing`
 *     on the customer (rare: owner deleted them in the dashboard), we
 *     clear the stale FK on the member row and bounce them to a
 *     friendly error state.
 *
 * Idempotency: sessions are single-use and short-lived; creating a
 * new one on every click is correct behavior, not wasteful.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withRequestContext } from "@/lib/request-id";
import { log } from "@/lib/log";
import { logAuditEvent } from "@/lib/audit";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  return withRequestContext(async () => {
    const origin = new URL(req.url).origin;

    // Origin check — tolerate missing Origin (native clients, some
    // browsers) but reject mismatches.
    const requestOrigin = req.headers.get("origin");
    if (requestOrigin && requestOrigin !== origin) {
      log.warn("billing portal: rejected cross-origin request", {
        requestOrigin,
      });
      return NextResponse.redirect(new URL("/portal", origin), 303);
    }

    if (!isStripeConfigured()) {
      log.warn("billing portal: Stripe not configured");
      return NextResponse.redirect(
        new URL("/portal?billing_error=unavailable", origin),
        303,
      );
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL("/portal/login", origin));
    }

    const svc = createServiceClient();
    const { data: member, error: memberErr } = await svc
      .from("members")
      .select("id, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) {
      log.error("billing portal: member lookup failed", {
        userId: user.id,
        err: memberErr.message,
      });
      return NextResponse.redirect(
        new URL("/portal?billing_error=lookup_failed", origin),
        303,
      );
    }

    if (!member?.stripe_customer_id) {
      log.info("billing portal: member has no Stripe customer", {
        userId: user.id,
        memberId: member?.id,
      });
      return NextResponse.redirect(
        new URL("/portal?billing_error=no_customer", origin),
        303,
      );
    }

    const stripe = getStripe();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: member.stripe_customer_id,
        // `?post_billing=1` triggers a banner in the portal that tells
        // members "changes may take up to 30s to reflect" — closes the
        // visual race between Stripe's webhook landing and the page
        // rendering.
        return_url: `${origin}/portal?post_billing=1`,
      });

      await logAuditEvent(
        "CREATE",
        "billing_portal_sessions",
        String(member.id),
        { sessionId: session.id, returnUrl: session.return_url },
      );

      return NextResponse.redirect(session.url, 303);
    } catch (err) {
      // `StripeInvalidRequestError` with code `resource_missing` means
      // the customer was deleted in Stripe (unusual but possible). Clear
      // the stale FK so next time we correctly route them to "no
      // subscription" instead of the same broken redirect.
      const isResourceMissing =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "resource_missing";

      if (isResourceMissing) {
        log.warn("billing portal: Stripe customer missing, clearing stale FK", {
          memberId: member.id,
        });
        await svc
          .from("members")
          .update({ stripe_customer_id: null })
          .eq("id", member.id);
        return NextResponse.redirect(
          new URL("/portal?billing_error=stale_customer", origin),
          303,
        );
      }

      log.error("billing portal: session creation failed", {
        memberId: member.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.redirect(
        new URL("/portal?billing_error=unavailable", origin),
        303,
      );
    }
  });
}
