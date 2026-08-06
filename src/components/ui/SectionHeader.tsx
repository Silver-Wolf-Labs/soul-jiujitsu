interface Props {
  tag?: string;
  title: string;
  subtitle?: string;
  tagColor?: string; // Tailwind text color class, defaults to blue-mid
  className?: string;
}

export default function SectionHeader({
  tag,
  title,
  subtitle,
  tagColor = "text-blue-mid",
  className = "",
}: Props) {
  return (
    <div className={className}>
      {tag && (
        <div
          className={`inline-flex items-center gap-2 font-mono text-[13px] tracking-ultra uppercase ${tagColor} border-l-[3px] border-blue-mid pl-2.5 mb-4`}
        >
          {tag}
        </div>
      )}
      <h2 className="font-display text-[clamp(50px,6vw,80px)] text-black leading-none mb-2">
        {title}
      </h2>
      {subtitle && (
        <p className="text-[15px] text-muted max-w-[520px] leading-relaxed mb-0">
          {subtitle}
        </p>
      )}
    </div>
  );
}
