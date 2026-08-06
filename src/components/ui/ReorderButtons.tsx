import { ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
}

export function ReorderButtons({ onUp, onDown, disableUp, disableDown }: Props) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <button
        onClick={onUp}
        disabled={disableUp}
        className="w-8 h-8 flex items-center justify-center text-muted hover:text-black hover:bg-off-white disabled:opacity-25 text-xs leading-none cursor-pointer disabled:cursor-default rounded transition-colors"
        title="Move up"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <button
        onClick={onDown}
        disabled={disableDown}
        className="w-8 h-8 flex items-center justify-center text-muted hover:text-black hover:bg-off-white disabled:opacity-25 text-xs leading-none cursor-pointer disabled:cursor-default rounded transition-colors"
        title="Move down"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
}
