import { test, expect, waitForStableLayout } from "../../support/fixtures";
import { MEMBER_CREDS, loginAsMember, missingCredsReason } from "../../support/auth";
import { t, tFormat, tRegex, pluralOptions, rx } from "../../support/messages";

/**
 * Gamification surfaces in the member portal: the XP bar, the training-day
 * streak, and the badge grid.
 *
 * Read-only like the rest of portal.spec.ts — a nightly run must not award or
 * revoke anything on a real member. These assert structure and internal
 * consistency, not values, because the test account's XP moves every time
 * somebody checks in on staging.
 *
 * The consistency checks are the interesting half. XP is summed from an
 * append-only ledger and the level is derived from it, so the numbers on screen
 * can disagree with each other if the derivation drifts — and a member noticing
 * "level 3" next to a bar that reads 140/100 is exactly the kind of bug that
 * makes the whole feature feel untrustworthy.
 */

test.describe("portal gamification", () => {
  test.skip(
    !MEMBER_CREDS,
    missingCredsReason("E2E_MEMBER_EMAIL", "E2E_MEMBER_PASSWORD")
  );

  test.setTimeout(90_000);

  test("XP card renders a progress bar with coherent ARIA values", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    const bar = page.getByRole("progressbar").first();
    await expect(
      bar,
      "No progressbar in the portal. getOwnGamification() probably threw — the page " +
        "catches gamification errors separately so the rest of the portal still renders, " +
        "which means this failure is silent in the UI."
    ).toBeVisible({ timeout: 20_000 });

    const now = Number(await bar.getAttribute("aria-valuenow"));
    const min = Number(await bar.getAttribute("aria-valuemin"));
    const max = Number(await bar.getAttribute("aria-valuemax"));

    expect(Number.isFinite(now) && Number.isFinite(min) && Number.isFinite(max),
      `Progressbar ARIA values are not all numeric: now=${now} min=${min} max=${max}`).toBe(true);

    // max is the level's XP denominator. Zero would divide by zero in the width
    // calculation; getOwnGamification() defends with `|| 100` for exactly this.
    expect(max, "aria-valuemax is 0 — the bar's denominator is unset and the width " +
      "calculation would be NaN.").toBeGreaterThan(0);

    expect(now, "aria-valuenow is below aria-valuemin.").toBeGreaterThanOrEqual(min);
    expect(now, `XP into level (${now}) exceeds the XP the level requires (${max}). ` +
      "The level derivation and the ledger sum have drifted apart.").toBeLessThanOrEqual(max);
  });

  test("level, XP total and the 'XP to next level' line agree", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    const bar = page.getByRole("progressbar").first();
    await expect(bar).toBeVisible({ timeout: 20_000 });

    // aria-label is the one place both numbers appear together, so it's the
    // cheapest way to read the level without coupling to layout.
    // Pattern built from the catalogue entry, not written out here. The hard-coded
    // /Level (\d+): (\d+) of (\d+) XP/ stopped matching the moment the portal
    // became Spanish, and reading the numbers by placeholder name rather than by
    // position means a translation that reorders them still works.
    const { pattern, names } = tRegex("portal.xp.progressLabel");
    const label = (await bar.getAttribute("aria-label")) ?? "";
    const m = label.match(pattern);
    expect(
      m,
      `Progressbar aria-label "${label}" does not match portal.xp.progressLabel ` +
        `(${pattern.source}). Either the label is built from different copy or the ` +
        `catalogue entry changed shape.`
    ).not.toBeNull();

    const group = (name: string) => Number(m![1 + names.indexOf(name)]);
    const level = group("level");
    const into = group("into");
    const forLevel = group("total");

    expect(level, "Level is below 1. Every member starts at level 1, even with 0 XP.")
      .toBeGreaterThanOrEqual(1);

    const body = await page.locator("body").innerText();

    // The card shows "N XP to level M" (or "Level M unlocked!"). M must be the
    // current level + 1 — an off-by-one here is very visible to the member.
    const remaining = forLevel - into;
    if (remaining > 0) {
      const expected = tFormat("portal.xp.toNextLevel", {
        remaining,
        level: level + 1,
      });
      expect(
        body,
        `Expected the card to offer "${expected}" given ${into}/${forLevel} at ` +
          `level ${level}.`
      ).toContain(expected);
    }
  });

  test("streak card states the Sunday rule so a closed day doesn't look like a bug", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    const body = await page.locator("body").innerText();

    // Without this line, a member who trained Fri and Mon sees a streak of 2 and
    // assumes it's broken counting. The copy is load-bearing, not decoration —
    // which is why the assertion is that the catalogue's sentence is on the page,
    // rather than a hand-written /sundays? don'?t break it/ that only ever
    // described the English.
    expect(
      body,
      "The streak card no longer explains that Sundays don't break the streak. " +
        "Members will read the gap as a counting bug."
    ).toContain(t("portal.streak.sundaysDontCount"));

    // Plural message, so either form is acceptable: the test account's streak
    // changes whenever somebody checks in on staging, and asserting on the count
    // would make this fail on a working portal.
    const dayUnits = pluralOptions("portal.streak.days");
    expect(
      body,
      `The streak card is missing its unit label (${dayUnits.join(" / ")}) — a bare ` +
        "number is ambiguous between days, weeks and classes (the portal shows all three)."
    ).toMatch(new RegExp(dayUnits.map(rx).join("|")));
  });

  test("the two streak figures on the page are labelled distinctly", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    const body = await page.locator("body").innerText();

    // Regression: the stats tile and the streak card both said "STREAK" while
    // showing different numbers (consecutive weeks vs consecutive days). Two
    // different values under one label reads as a bug in the app.
    //
    // Asserting the tile's disambiguated label rather than the absence of a bare
    // "RACHA": the StreakCard's own heading legitimately renders as "RACHA"
    // (it's `uppercase` in CSS, and innerText reflects text-transform), so a
    // negative match would fail on correct markup.
    const tileLabel = t("portal.stats.weekStreak");
    expect(
      body,
      `The weekly stats tile is no longer labelled "${tileLabel}". It sits on the same ` +
        "page as the training-day streak card, so an ambiguous label puts two " +
        "different numbers under the same name."
    ).toContain(tileLabel);
  });

  test("badge grid renders with coherent earned/total counters", async ({ page, assertNoProblems }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    // Scope to the Achievements card. A page-wide regex for "N/M" would also
    // catch dates and any other slashed number elsewhere in the portal.
    // Walk up from the heading rather than filtering divs by containment. Every
    // ancestor div "contains" the heading, so `.last()` resolved to the innermost
    // one — the heading row, which holds the title and the counter and none of the
    // badges, and reported "no category headings" about markup that could not have
    // had any. `.first()` would swing the other way and match a page-level wrapper,
    // losing the scoping this test wants. Two steps up from the h2 is the card
    // itself: h2 → heading row → card (see BadgeGrid).
    const heading = t("portal.badges.heading");
    const grid = page.getByRole("heading", { name: heading }).locator("../..");
    await expect(
      grid,
      `No "${heading}" card in the portal. BadgeGrid returns null when every category ` +
        "is empty, so this also fires if getOwnBadges() came back empty."
    ).toBeVisible({ timeout: 20_000 });

    const text = await grid.innerText();

    // At least one category heading proves the grid grouped rather than rendering
    // one undifferentiated wall. Categories come from the catalogue (the badge
    // *names* are the gym's, the groupings are the system's), so they are read from
    // it rather than pasted — a renamed category should not read as a broken grid.
    const categories = ["milestone", "consistency", "modality", "skill", "community"].map(
      (c) => t(`portal.badges.categories.${c}`)
    );
    // Case-insensitive: the category headings are `uppercase` in CSS and innerText
    // reflects text-transform, so the page reads "HITOS" where the catalogue says
    // "Hitos". Matching case here would assert on a stylesheet, not on the copy.
    expect(
      text,
      `No badge category headings (${categories.join("/")}) inside the ` +
        `"${heading}" card.`
    ).toMatch(new RegExp(categories.map(rx).join("|"), "i"));

    const counts = text.match(/\d+\s*\/\s*\d+/g) ?? [];
    expect(
      counts.length,
      "No earned/total counters in the badge grid — members can't see how much is left."
    ).toBeGreaterThan(0);

    for (const c of counts) {
      const [earned, total] = c.split("/").map((s) => Number(s.trim()));
      expect(
        earned,
        `Badge counter "${c}" claims more earned than the category contains — the ` +
          "earned and locked sets have gone out of sync (a badge counted in both)."
      ).toBeLessThanOrEqual(total);
    }

    assertNoProblems("portal badge grid");
  });
});
