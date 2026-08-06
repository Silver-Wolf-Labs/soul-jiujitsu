import Link from "next/link";
import { Check, AlertCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { getContentHealth } from "@/lib/content-health";

export default async function ContentHealthWidget() {
  const issues = await getContentHealth();

  if (issues.length === 0) {
    return (
      <div className="bg-success-light border border-success-border rounded-lg p-4 flex items-center gap-3">
        <Check className="w-5 h-5 text-success" />
        <div>
          <p className="text-sm font-semibold text-success">Content looks good</p>
          <p className="text-xs text-success">No issues found across hero, team, pricing, blog, or sections.</p>
        </div>
      </div>
    );
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Content Health</h3>
        <div className="flex gap-2 text-xs">
          {errors.length > 0 && (
            <span className="bg-danger-light text-danger border border-danger-border rounded px-2 py-0.5">
              {errors.length} error{errors.length > 1 ? "s" : ""}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="bg-yellow-light text-yellow-dark border border-yellow-border rounded px-2 py-0.5">
              {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <ul className="divide-y divide-line">
        {issues.map((issue) => (
          <li key={issue.id} className="px-4 py-3 flex items-start gap-3">
            <span className={`mt-0.5 text-sm flex-shrink-0 ${issue.severity === "error" ? "text-danger" : "text-yellow"}`}>
              {issue.severity === "error" ? <AlertCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">{issue.label}</p>
              <p className="text-xs text-muted">{issue.detail}</p>
            </div>
            <Link
              href={issue.fixHref}
              className="text-xs text-blue-mid hover:underline flex-shrink-0 mt-0.5"
            >
              Fix <ArrowRight className="inline w-3 h-3 ml-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
