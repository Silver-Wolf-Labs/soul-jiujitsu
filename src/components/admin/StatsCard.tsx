import Link from "next/link";

interface Props {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
  href?: string;
}

export default function StatsCard({ label, value, sub, accent, href }: Props) {
  const content = (
    <>
      <div className="text-[11px] font-semibold tracking-wider uppercase text-muted mb-1.5">
        {label}
      </div>
      <div className="font-display text-4xl sm:text-5xl text-black leading-none">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </>
  );

  const className = `rounded-lg p-4 sm:p-6 border ${
    accent
      ? "bg-yellow-light border-yellow-mid"
      : "bg-white border-line"
  } ${href ? "hover:border-black hover:shadow-sm transition-all cursor-pointer" : ""}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
