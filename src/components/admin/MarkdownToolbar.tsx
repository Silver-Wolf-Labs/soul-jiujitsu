"use client";

import { RefObject } from "react";

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}

function mdWrap(
  ta: HTMLTextAreaElement | null,
  setValue: (v: string) => void,
  before: string,
  after: string,
  placeholder = "text"
) {
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.slice(start, end) || placeholder;
  const newVal =
    ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
  setValue(newVal);
  setTimeout(() => {
    ta.focus();
    ta.selectionStart = start + before.length;
    ta.selectionEnd = start + before.length + selected.length;
  }, 0);
}

function mdLine(
  ta: HTMLTextAreaElement | null,
  setValue: (v: string) => void,
  prefix: string,
  placeholder = "item"
) {
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.slice(start, end);
  const lines = selected ? selected.split("\n") : [placeholder];
  const prefixed = lines.map((l) => prefix + l).join("\n");
  const newVal = ta.value.slice(0, start) + prefixed + ta.value.slice(end);
  setValue(newVal);
  setTimeout(() => {
    ta.focus();
    ta.selectionStart = start;
    ta.selectionEnd = start + prefixed.length;
  }, 0);
}

const btnCls =
  "min-w-[32px] h-8 px-1.5 sm:px-2 flex items-center justify-center border border-line rounded text-xs sm:text-sm font-medium hover:border-black hover:bg-off-white/60 transition-colors select-none active:scale-95";

export default function MarkdownToolbar({
  textareaRef,
  onChange,
}: Props) {
  const wrap = (before: string, after: string, ph?: string) => {
    mdWrap(textareaRef.current, onChange, before, after, ph);
  };
  const line = (prefix: string, ph?: string) => {
    mdLine(textareaRef.current, onChange, prefix, ph);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        type="button"
        title="Heading"
        onMouseDown={(e) => {
          e.preventDefault();
          line("## ", "heading");
        }}
        className={btnCls}
      >
        H
      </button>
      <button
        type="button"
        title="Bold"
        onMouseDown={(e) => {
          e.preventDefault();
          wrap("**", "**");
        }}
        className={`${btnCls} font-bold`}
      >
        B
      </button>
      <button
        type="button"
        title="Italic"
        onMouseDown={(e) => {
          e.preventDefault();
          wrap("*", "*");
        }}
        className={`${btnCls} italic`}
      >
        I
      </button>
      <button
        type="button"
        title="Strikethrough"
        onMouseDown={(e) => {
          e.preventDefault();
          wrap("~~", "~~");
        }}
        className={`${btnCls} line-through`}
      >
        S
      </button>
      <div className="w-px h-5 bg-line mx-0.5" />
      <button
        type="button"
        title="Bulleted list"
        onMouseDown={(e) => {
          e.preventDefault();
          line("- ");
        }}
        className={btnCls}
      >
        •&thinsp;List
      </button>
      <button
        type="button"
        title="Numbered list"
        onMouseDown={(e) => {
          e.preventDefault();
          line("1. ");
        }}
        className={btnCls}
      >
        1.&thinsp;List
      </button>
      <div className="w-px h-5 bg-line mx-0.5" />
      <button
        type="button"
        title="Link"
        onMouseDown={(e) => {
          e.preventDefault();
          const url = prompt("URL:");
          if (url) wrap("[", `](${url})`, "link text");
        }}
        className={btnCls}
      >
        Link
      </button>
    </div>
  );
}
