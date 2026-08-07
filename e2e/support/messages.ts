import messages from "../../src/messages/es-CR.json";

/**
 * Read UI copy from the app's own message catalogue instead of hard-coding it.
 *
 * The portal moved to `next-intl` and twelve authenticated tests broke at once,
 * all for the same reason: they matched English that no longer renders
 * ("sign out", "Level 2: 37 of 200 XP", "Achievements"). Pasting the Spanish in
 * would fix today's run and break again on the next phase of translation, or the
 * first time somebody rewords a label — and it would let a *missing* translation
 * pass, since a test asserting a literal cannot tell copy from a fallback.
 *
 * So the tests ask the catalogue. If a key is renamed or deleted, `t()` throws
 * with the key name rather than timing out on a selector, which is the difference
 * between a two-minute fix and an afternoon.
 *
 * This does mean a test cannot catch "the catalogue says the wrong thing" — that
 * is a copy review, not something an e2e assertion was ever going to find. What
 * it does catch is the thing that actually breaks: the string is missing from the
 * page, or the page is rendering a raw key.
 */

type Catalogue = Record<string, unknown>;

/**
 * Look up a dotted key, e.g. `t("portal.nav.signOut")`.
 *
 * Throws on a missing key. Deliberate: a silent "" would turn into a regex that
 * matches everything, so the suite would go green while asserting nothing at all.
 */
export function t(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node && typeof node === "object" ? (node as Catalogue)[part] : undefined),
      messages
    );

  if (typeof value !== "string") {
    throw new Error(
      `Message key "${key}" is missing from src/messages/es-CR.json (resolved to ${typeof value}). ` +
        `If the key was renamed, update the test; if the string was dropped, the UI is untranslated.`
    );
  }
  return value;
}

/**
 * Fill an ICU message's simple `{placeholders}`, so a test can build the exact
 * string the page will show.
 *
 * Handles interpolation only — NOT plural/select. Those pick a branch by number
 * and reimplementing that here would mean this helper could disagree with the
 * real formatter while looking authoritative. For a plural message, assert on
 * the numbers and structure instead, or match `pluralOptions()` below.
 */
export function tFormat(key: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [name, value]) => out.split(`{${name}}`).join(String(value)),
    t(key)
  );
}

/**
 * The literal branches of an ICU plural message, e.g. `["día de entreno",
 * "días de entreno"]` — with `#` left in place.
 *
 * For asserting that *one of* the forms is on the page when the test has no
 * business knowing the member's current count (streaks and XP move every time
 * somebody checks in on staging, which is why these tests assert shape rather
 * than values).
 */
export function pluralOptions(key: string): string[] {
  const message = t(key);
  const branches = [...message.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1].trim());
  // The outer `{count, plural, ...}` wrapper is not itself a branch.
  return branches.filter((b) => b && !b.startsWith("count,"));
}

/** Escape a catalogue string for use inside a RegExp. */
export function rx(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turn a message into a RegExp whose `{placeholders}` become capture groups, so a
 * test can read numbers out of a translated string without restating its wording.
 *
 * `tRegex("portal.xp.progressLabel")` on "Nivel {level}: {into} de {total} XP"
 * gives `/^Nivel (\d+): (\d+) de (\d+) XP$/`, and the groups come back in the
 * order the placeholders appear *in the message* — which is the point: a
 * translation is free to reorder them, and the test follows automatically.
 *
 * `names` is returned alongside so a caller can index by placeholder name rather
 * than by position, since position is exactly the thing that is not stable.
 * Defaults to `\d+`; pass `capture` to widen it for a non-numeric placeholder.
 */
export function tRegex(
  key: string,
  capture = "\\d+"
): { pattern: RegExp; names: string[] } {
  const message = t(key);
  const names = [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  // Escape first, then swap the (now-escaped) placeholders for groups — doing it
  // the other way round would escape the group syntax we just inserted.
  const body = names.reduce(
    (out, name) => out.replace(`\\{${name}\\}`, `(${capture})`),
    rx(message)
  );
  return { pattern: new RegExp(`^${body}$`), names };
}
