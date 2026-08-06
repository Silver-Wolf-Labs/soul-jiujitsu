interface Props {
  className?: string;
  children: React.ReactNode;
}

export default function Tag({ className = "", children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full ${className}`}
    >
      {children}
    </span>
  );
}
