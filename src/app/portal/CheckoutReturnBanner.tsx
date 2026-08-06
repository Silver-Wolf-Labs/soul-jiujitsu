"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type Banner = { message: string; variant: "success" | "warning" };

export default function CheckoutReturnBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const enrolled = params.get("enrolled");
    const purchased = params.get("purchased");
    const postBilling = params.get("post_billing");
    const billingError = params.get("billing_error");

    if (enrolled === "true") {
      setBanner({ message: "Payment received! Your membership is being activated.", variant: "success" });
    } else if (purchased === "true") {
      setBanner({ message: "Purchase complete! Thank you.", variant: "success" });
    } else if (enrolled === "false") {
      setBanner({ message: "Enrollment was canceled. You can try again anytime.", variant: "warning" });
    } else if (purchased === "false") {
      setBanner({ message: "Purchase was canceled. You can try again anytime.", variant: "warning" });
    } else if (postBilling === "1") {
      // Member just returned from Stripe Customer Portal. Their
      // subscription state change is propagating via webhook; it can
      // take up to 30 s to reflect. A soft "we're updating" banner
      // closes the visual race without relying on a poll.
      setBanner({
        message: "Billing changes saved. It may take up to 30 seconds for your subscription status to update here.",
        variant: "success",
      });
    } else if (billingError) {
      const errorCopy = {
        no_customer: "You don't have an active subscription yet. Pick a plan to get started.",
        stale_customer: "We couldn't find your billing profile. Please contact us and we'll help sort it out.",
        unavailable: "Billing is temporarily unavailable. Please try again in a few minutes.",
        lookup_failed: "We couldn't load your billing info. Please refresh and try again.",
      }[billingError] ?? "We couldn't open the billing portal. Please try again.";
      setBanner({ message: errorCopy, variant: "warning" });
    } else {
      return; // No relevant params
    }

    handled.current = true;
    router.replace("/portal", { scroll: false });
  }, [params, router]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 10000);
    return () => clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;

  const colors =
    banner.variant === "success"
      ? "bg-success-light border-success-border text-success"
      : "bg-yellow-light border-yellow-border text-yellow-dark";

  return (
    <div
      className={`border rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-between ${colors}`}
      role="status"
    >
      <span>{banner.message}</span>
      <button
        onClick={() => setBanner(null)}
        className="ml-3 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
