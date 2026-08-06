import { BeltColor, BELT_BODY_HEX, BELT_TIP_HEX, BELT_BORDER_HEX } from "@/lib/constants";

// Stripe positions as % of the tip's own width (right-anchored).
// Using percentages keeps ratios consistent across every container size —
// pixel offsets would overflow the tip on narrow screens (e.g. mobile cards).
// Max extent: 70% from right (66 + 4 width) → stripes always stay inside the tip.
const STRIPE_RIGHTS_PCT  = [6, 18, 30, 42, 54, 66];
const STRIPE_WIDTH_PCT   = 4;

interface Props {
  belt: string;
  stripes: number;
  /** Tailwind classes for the outer container. Defaults to "w-full max-w-xs" */
  className?: string;
  /**
   * Wraps the belt in a translucent frosted mount so a true-black tip
   * remains visible on dark backgrounds (e.g. kiosk check-in screen).
   */
  backdrop?: boolean;
}

export default function BeltVisual({ belt, stripes, className = "w-full max-w-xs", backdrop = false }: Props) {
  const b      = belt as BeltColor;
  const body   = BELT_BODY_HEX[b]   ?? BELT_BODY_HEX[BeltColor.White];
  const tip    = BELT_TIP_HEX[b]    ?? BELT_TIP_HEX[BeltColor.White];
  const border = BELT_BORDER_HEX[b] ?? BELT_BORDER_HEX[BeltColor.White];

  const strip = (
    <div
      className={`flex rounded overflow-hidden shadow-sm ${backdrop ? "w-full" : className}`}
      style={{ border: `1.5px solid ${border}`, aspectRatio: "20/3" }}
    >
      {/* Belt body */}
      <div className="flex-1" style={{ backgroundColor: body }} />
      {/* Tip with stripes */}
      <div className="relative flex-none" style={{ width: "38%", backgroundColor: tip }}>
        {Array.from({ length: stripes }).map((_, i) => (
          <div
            key={i}
            className="absolute bg-white"
            style={{ width: `${STRIPE_WIDTH_PCT}%`, top: "12%", bottom: "12%", right: `${STRIPE_RIGHTS_PCT[i]}%`, borderRadius: 2 }}
          />
        ))}
      </div>
    </div>
  );

  if (backdrop) {
    return (
      <div className={`bg-white/[0.07] rounded-xl p-2.5 ${className}`}>
        {strip}
      </div>
    );
  }

  return strip;
}
