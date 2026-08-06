interface StatusBannerProps {
  status: { type: "success" | "error"; message: string } | null;
}

export default function StatusBanner({ status }: StatusBannerProps) {
  if (!status) return null;

  return (
    <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg ${
      status.type === "success"
        ? "bg-green-500/10 text-green-400 border border-green-500/20"
        : "bg-red-500/10 text-red-400 border border-red-500/20"
    }`}>
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d={
          status.type === "success"
            ? "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            : "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        } />
      </svg>
      {status.message}
    </div>
  );
}
