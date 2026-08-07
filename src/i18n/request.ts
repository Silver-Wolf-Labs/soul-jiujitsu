import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE } from "./config";

/**
 * Server-side i18n resolution for every request.
 *
 * With no locale routing there is no `[locale]` param to read, so the locale is
 * returned directly. This is the one seam a future language switcher hooks into:
 * read a cookie (or the member's preference column) here and return that
 * instead — no component changes, because components ask for `t()`, not for a
 * language.
 *
 * `timeZone` is pinned rather than left to the runtime. Vercel functions run in
 * UTC, so an unpinned <Intl> date renders one day off for late-evening Costa
 * Rica timestamps — the same class of bug the gym-local `class_date` handling
 * exists to avoid elsewhere in this codebase.
 *
 * WHAT DOES *NOT* BELONG IN THE MESSAGE CATALOGUE
 * -----------------------------------------------
 * Anything the profe or a member types: class and modality names, coach names
 * and titles, FAQs, blog posts, the homepage splash, and the badge names and
 * descriptions seeded in `badges`. Those are content, they are already stored in
 * Spanish as written, and they render straight from the database. Translating
 * them here would mean a code change every time Tristán renames a class.
 *
 * What goes here is everything the SYSTEM says: labels, buttons, empty states,
 * validation and error copy, plural forms, and enum labels (member status,
 * membership status, belt colours, relationship options). The test is authorship
 * — if a human at the gym wrote the string, it stays in the database.
 */
export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;

  return {
    locale,
    timeZone: "America/Costa_Rica",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
