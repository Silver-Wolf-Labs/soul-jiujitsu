"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, subtitle, children }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleKey);
      contentRef.current?.scrollTo(0, 0);
    }
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 z-[3000] flex items-end md:items-center md:justify-center md:p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        ref={contentRef}
        className="bg-white w-full h-full overflow-y-auto md:h-auto md:rounded-lg md:max-w-[420px] md:max-h-[90vh] md:shadow-2xl p-5 sm:p-7"
      >
        <h3 className="font-display text-[26px] text-black mb-1">{title}</h3>
        {subtitle && <p className="text-xs text-muted mb-5">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
