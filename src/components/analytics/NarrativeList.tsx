import type { Narrative, NarrativeSeverity } from "@/lib/analytics/types";

const STYLES: Record<NarrativeSeverity, { dot: string; text: string; bg: string }> = {
  info:    { dot: "bg-muted",        text: "text-ink",         bg: "bg-paper" },
  good:    { dot: "bg-success",      text: "text-success-dark", bg: "bg-success-light" },
  warning: { dot: "bg-status-alert", text: "text-ink",         bg: "bg-status-alert-light" },
  danger:  { dot: "bg-danger",       text: "text-danger-dark", bg: "bg-status-error-light" },
};

/**
 * Small list of rule-based callouts above the dashboard content. Severities
 * are color-coded via existing semantic tokens. When the rule set produces
 * nothing, the component renders nothing — never ship a dead "No insights"
 * placeholder.
 */
export default function NarrativeList({ items }: { items: Narrative[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((n, i) => {
        const s = STYLES[n.severity];
        return (
          <li
            key={i}
            className={`${s.bg} ${s.text} text-sm rounded-md px-3 py-2 flex items-start gap-2.5`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot} mt-[7px] flex-shrink-0`} aria-hidden />
            <span>{n.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
