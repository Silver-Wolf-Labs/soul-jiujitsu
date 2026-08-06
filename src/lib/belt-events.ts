/**
 * Belt history event types — mirrors the DB CHECK constraint on
 * belt_history.event_type. Shared between server actions and client
 * components (the signup flow's admin modal, the member detail timeline).
 *
 * Kept in a plain TS module rather than the "use server" actions file so
 * the label helper is callable from client components without tripping
 * Next.js's server-action export rules.
 */

export type BeltEventType = "promotion" | "stripe" | "correction";

export const BELT_EVENT_TYPES: readonly BeltEventType[] = [
  "promotion",
  "stripe",
  "correction",
] as const;

/** Human-readable label for the timeline + pickers. */
export function labelForEvent(event: BeltEventType): string {
  switch (event) {
    case "promotion":  return "Belt Promotion";
    case "stripe":     return "Stripe Award";
    case "correction": return "Correction";
  }
}
