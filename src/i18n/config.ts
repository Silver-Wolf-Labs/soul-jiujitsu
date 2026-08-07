/**
 * Locale configuration.
 *
 * NO LOCALE ROUTING, DELIBERATELY
 * -------------------------------
 * next-intl's documented default is a `[locale]` route segment (/es/portal,
 * /en/portal). This app runs in its "without i18n routing" mode instead: URLs
 * are untouched and the locale is resolved server-side.
 *
 * The reason is blast radius. Moving every route under a locale segment would
 * touch the auth middleware (which gates /portal on a signed waiver), the
 * Supabase redirect allowlist — an exact-match list of URLs configured in a
 * dashboard, outside this repo — the Stripe return URLs, and the sitemap. That
 * is a lot of surface to disturb for the actual goal, which is that the member
 * portal stopped being half English.
 *
 * Adding a second locale later does not require adopting routing either: a
 * cookie or a member preference column can drive `getRequestConfig` instead.
 * That's the reason this file exists rather than the locale being inlined —
 * DEFAULT_LOCALE is the single place that changes.
 */

export const LOCALES = ["es-CR"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * "es-CR", not plain "es". This tag drives Intl formatting as well as message
 * lookup, and the two are not interchangeable — measured on Node 22:
 *
 *   es      → "12:30"           (24-hour, no day period)
 *   es-CR   → "12:30 p. m."     (12-hour with a day period)
 *
 * Every formatter in src/lib/utils.ts already passes "es-CR" explicitly, so
 * plain "es" here would put next-intl's <Intl> output at odds with the dates
 * rendered right beside it by formatDateTz — 12-hour clocks in one card and
 * 24-hour in the next.
 */
export const DEFAULT_LOCALE: Locale = "es-CR";
