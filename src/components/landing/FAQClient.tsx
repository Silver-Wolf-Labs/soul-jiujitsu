"use client";

import { useState } from "react";
import { InlineMd } from "@/components/ui/InlineMd";

interface Props {
  items: { question: string; answer: string }[];
}

export default function FAQClient({ items }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <>
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={i} className="border-b border-line">
            <button
              className="w-full flex justify-between items-center py-[22px] gap-4 cursor-pointer bg-transparent text-left"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
            >
              <span className="text-[16px] font-semibold text-ink">{item.question}</span>
              <span
                className={`w-7 h-7 rounded-full border border-line flex items-center justify-center text-base text-muted flex-shrink-0 transition-all duration-200 ${
                  isOpen ? "bg-black border-black text-white rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            <div
              className={`text-[15px] text-muted leading-relaxed overflow-hidden transition-all duration-300 ${
                isOpen ? "max-h-[400px] pb-[22px]" : "max-h-0"
              }`}
            >
              <InlineMd text={item.answer} />
            </div>
          </div>
        );
      })}
    </>
  );
}
