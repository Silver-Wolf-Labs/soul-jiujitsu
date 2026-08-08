/**
 * Costa Rican colón formatting.
 *
 * ── Why cents at all ────────────────────────────────────────────────────────
 * Every price in this app is stored as `price_cents` — an integer count of
 * hundredths — and that stays true for colones. The column name is inherited
 * and slightly wrong (a colón's subunit is the céntimo, long out of
 * circulation), but the *storage contract* is what matters: integers, no
 * floats, no rounding drift. Only presentation changes here.
 *
 * ── Why not Intl.NumberFormat ───────────────────────────────────────────────
 * `Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC" })` is the
 * obvious answer and is deliberately not used:
 *
 *   1. It emits a non-breaking space between the ₡ and the digits, and the
 *      exact glyph/spacing varies by ICU version — so the same build renders
 *      differently on the Lambda runtime and in the browser, which shows up as
 *      hydration mismatches on server-rendered price cards.
 *   2. It appends ",00" decimals. Costa Rican gym pricing is whole-colón; the
 *      cards read "₡40.000", never "₡40.000,00".
 *   3. The ₡ sign is rendered separately in the pricing cards (a small <sup>),
 *      so callers need the bare number anyway.
 *
 * The formatting rule is simple and stable enough to own outright: group
 * thousands with dots, which is the es-CR convention (and the inverse of
 * en-US).
 */

/**
 * Format an integer cent amount as a colón amount with dot thousand
 * separators, without the ₡ sign.
 *
 * Céntimos are truncated, not rounded: prices are authored in whole colones,
 * so a fractional remainder means dirty data (a bad import, a stale row from
 * when amounts were dollars), and rounding 99 céntimos up to the next colón
 * would quietly inflate a displayed price. Truncating keeps the shown number
 * at or below what is stored.
 *
 * Negative amounts keep their sign and group the digits after it. Nothing in
 * the app stores a negative price today; this exists so a future credit or
 * adjustment renders as "-1.500" rather than something malformed.
 *
 * @example
 * formatColones(0)         // "0"
 * formatColones(50000)     // "500"
 * formatColones(4000000)   // "40.000"
 * formatColones(150000000) // "1.500.000"
 * formatColones(4000099)   // "40.000"  (céntimos truncated)
 */
export function formatColones(cents: number): string {
  if (!Number.isFinite(cents)) return "0";

  // Math.trunc, not Math.floor: floor(-150.5) = -151 would round a negative
  // amount *away* from zero, growing it. trunc drops the fraction either way.
  const whole = Math.abs(Math.trunc(cents / 100));
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  // `cents < 0` alone would print "-0" for a small negative like -50, which
  // truncates to zero colones. The sign is only meaningful once there is a
  // nonzero magnitude to sign.
  return cents < 0 && whole > 0 ? `-${grouped}` : grouped;
}

/**
 * Same amount, with the ₡ sign attached — for the places that render a price
 * inline in a sentence or a table cell and have nowhere to put a separate sign
 * element.
 *
 * @example
 * formatColonesWithSign(4000000) // "₡40.000"
 */
export function formatColonesWithSign(cents: number): string {
  return `₡${formatColones(cents)}`;
}

/**
 * Parse an admin-typed colón amount into the integer cents the DB stores.
 *
 * Accepts what someone actually types into a price field: plain digits
 * ("40000"), dot-grouped ("40.000"), and stray whitespace or a leading ₡.
 *
 * Grouping dots are dropped rather than read as a decimal point, which is the
 * whole reason this is a named function instead of a `parseFloat` at the call
 * site: `parseFloat("40.000")` returns 40, silently turning ₡40.000 into ₡40 —
 * a 1000× under-charge that looks entirely plausible sitting in a form field.
 *
 * Because a dot is being *discarded*, its position is validated first: a dot
 * must have exactly three digits after it, i.e. it must actually be grouping.
 * Otherwise "40000.5" would collapse to 400005 and store ten times the intended
 * price — the same class of bug as the parseFloat one, in the other direction.
 * Rather than guess whether such input means céntimos or a mistyped group, it is
 * rejected; prices here are whole colones, so there is no correct reading of it.
 *
 * Returns null for anything it can't read, so callers can show a validation
 * message rather than writing a wrong number (or NaN) to the DB.
 *
 * @example
 * parseColonesToCents("40000")   // 4000000
 * parseColonesToCents("40.000")  // 4000000
 * parseColonesToCents("40000.5") // null — ambiguous, not a group of three
 * parseColonesToCents("")        // null
 */
export function parseColonesToCents(input: string): number | null {
  const trimmed = input.trim().replace(/[₡\s]/g, "");
  // Either no dots at all, or dot-grouped with 1–3 leading digits and every
  // subsequent group exactly three long.
  if (!/^-?\d{1,3}(\.\d{3})*$/.test(trimmed) && !/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const cleaned = trimmed.replace(/\./g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const colones = Number(cleaned);
  if (!Number.isFinite(colones)) return null;
  return colones * 100;
}
