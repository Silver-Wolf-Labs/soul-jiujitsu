/**
 * Framed section container used by every analytics dashboard. Consistent
 * framing is more important than per-surface creativity here — the
 * suite should feel like one product, not a collage.
 */
export default function DashboardCard({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-line rounded-lg ${className}`}>
      <header className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3 border-b border-line">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink truncate">{title}</h2>
          {subtitle ? <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
