/**
 * Horizontal divider bar using the active theme's accent colors.
 * Each segment maps to a theme role: primary, info, accent, warm, dark.
 */
const SEGMENTS = [
  { key: "primary", bg: "bg-yellow" },
  { key: "info",    bg: "bg-blue" },
  { key: "accent",  bg: "bg-purple" },
  { key: "warm",    bg: "bg-brown" },
  { key: "dark",    bg: "bg-black" },
];

export default function BeltDivider() {
  return (
    <div className="flex h-[6px] w-full">
      {SEGMENTS.map(({ key, bg }) => (
        <span key={key} className={`flex-1 ${bg}`} />
      ))}
    </div>
  );
}
