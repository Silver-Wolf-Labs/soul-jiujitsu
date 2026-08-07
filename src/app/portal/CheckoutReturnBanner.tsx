"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Which message to show, resolved from the URL. Deliberately a key rather than
 * the rendered string: the effect below runs once (guarded by `handled`) and
 * then strips the params, so storing translated copy in state would mean `t`
 * had to be an effect dependency — and a re-run after the params are gone
 * resolves to nothing and blanks the banner.
 */
type BannerKey =
  | "enrolled"
  | "purchased"
  | "enrollCanceled"
  | "purchaseCanceled"
  | "postBilling"
  | `billingError.${"noCustomer" | "staleCustomer" | "unavailable" | "lookupFailed" | "generic"}`;

type Banner = { key: BannerKey; variant: "success" | "warning" };

const BILLING_ERROR_KEYS: Record<string, BannerKey> = {
  no_customer:    "billingError.noCustomer",
  stale_customer: "billingError.staleCustomer",
  unavailable:    "billingError.unavailable",
  lookup_failed:  "billingError.lookupFailed",
};

export default function CheckoutReturnBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const t = useTranslations("portal.checkoutBanner");
  const [banner, setBanner] = useState<Banner | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const enrolled = params.get("enrolled");
    const purchased = params.get("purchased");
    const postBilling = params.get("post_billing");
    const billingError = params.get("billing_error");

    if (enrolled === "true") {
      setBanner({ key: "enrolled", variant: "success" });
    } else if (purchased === "true") {
      setBanner({ key: "purchased", variant: "success" });
    } else if (enrolled === "false") {
      setBanner({ key: "enrollCanceled", variant: "warning" });
    } else if (purchased === "false") {
      setBanner({ key: "purchaseCanceled", variant: "warning" });
    } else if (postBilling === "1") {
      // Member just returned from Stripe Customer Portal. Their
      // subscription state change is propagating via webhook; it can
      // take up to 30 s to reflect. A soft "we're updating" banner
      // closes the visual race without relying on a poll.
      setBanner({ key: "postBilling", variant: "success" });
    } else if (billingError) {
      setBanner({
        key: BILLING_ERROR_KEYS[billingError] ?? "billingError.generic",
        variant: "warning",
      });
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
      <span>{t(banner.key)}</span>
      <button
        onClick={() => setBanner(null)}
        className="ml-3 opacity-60 hover:opacity-100 transition-opacity"
        aria-label={t("dismiss")}
      >
        &times;
      </button>
    </div>
  );
}
