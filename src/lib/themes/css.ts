import type { ThemeColorSlots } from "./types";

/** Convert camelCase key to kebab-case CSS var name */
function toKebab(key: string): string {
  return key.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/** Serialise a theme's slots into a :root { ... } CSS block */
export function slotsToCustomProperties(slots: ThemeColorSlots): string {
  const body = (Object.entries(slots) as [string, string][])
    .map(([key, value]) => `  --color-${toKebab(key)}: ${value};`)
    .join("\n");
  return `:root {\n${body}\n}`;
}
