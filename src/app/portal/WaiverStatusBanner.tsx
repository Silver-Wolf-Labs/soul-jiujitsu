import Link from "next/link";
import { useTranslations } from "next-intl";

type WaiverStatus = "not_required" | "pending" | "signed" | "expired";

export default function WaiverStatusBanner({
  status,
}: {
  status: WaiverStatus | null | undefined;
}) {
  const t = useTranslations("portal.waiverBanner");

  if (status !== "pending" && status !== "expired") return null;

  return (
    <div className="rounded-lg border border-yellow bg-yellow/10 px-4 py-3 flex items-start gap-3">
      <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-yellow flex items-center justify-center">
        <span className="text-[10px] font-bold text-black leading-none">!</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">
          {status === "expired" ? t("expiredTitle") : t("pendingTitle")}
        </p>
        <p className="text-xs text-muted mt-0.5">
          {t("body")}{" "}
          <Link
            href="/waiver"
            className="text-ink font-semibold underline underline-offset-2 hover:opacity-70"
          >
            {t("signNow")}
          </Link>
        </p>
      </div>
    </div>
  );
}
