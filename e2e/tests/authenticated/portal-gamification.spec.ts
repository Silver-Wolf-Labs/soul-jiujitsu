import { test, expect, waitForStableLayout } from "../../support/fixtures";
import { MEMBER_CREDS, loginAsMember, missingCredsReason } from "../../support/auth";

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
    const label = (await bar.getAttribute("aria-label")) ?? "";
    const m = label.match(/Level (\d+): (\d+) of (\d+) XP/);
    expect(m, `Progressbar aria-label didn't match the expected shape: "${label}"`).not.toBeNull();

    const [, levelStr, intoStr, forStr] = m!;
    const level = Number(levelStr);
    const into = Number(intoStr);
    const forLevel = Number(forStr);

    expect(level, "Level is below 1. Every member starts at level 1, even with 0 XP.")
      .toBeGreaterThanOrEqual(1);

    const body = await page.locator("body").innerText();

    // The card shows "N XP to level M" (or "Level M unlocked!"). M must be the
    // current level + 1 — an off-by-one here is very visible to the member.
    const remaining = forLevel - into;
    if (remaining > 0) {
      expect(
        body,
        `Expected the card to offer "${remaining} XP to level ${level + 1}" given ` +
          `${into}/${forLevel} at level ${level}.`
      ).toContain(`${remaining} XP to level ${level + 1}`);
    }
  });

  test("streak card states the Sunday rule so a closed day doesn't look like a bug", async ({ page }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    const body = await page.locator("body").innerText();

    // Without this line, a member who trained Fri and Mon sees a streak of 2 and
    // assumes it's broken counting. The copy is load-bearing, not decoration.
    expect(
      body,
      "The streak card no longer explains that Sundays don't break the streak. " +
        "Members will read the gap as a counting bug."
    ).toMatch(/sundays? don'?t break it/i);

    expect(
      body,
      "The streak card is missing its 'training days' unit label — a bare number " +
        "is ambiguous between days, weeks and classes (the portal shows all three)."
    ).toMatch(/training days?/i);
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
    // "STREAK": the StreakCard's own heading legitimately renders as "STREAK"
    // (it's `uppercase` in CSS, and innerText reflects text-transform), so a
    // negative match would fail on correct markup.
    expect(
      body,
      "The weekly stats tile is no longer labelled 'WEEK STREAK'. It sits on the same " +
        "page as the training-day streak card, so an ambiguous label puts two " +
        "different numbers under the same name."
    ).toMatch(/WEEK STREAK/i);
  });

  test("badge grid renders with coherent earned/total counters", async ({ page, assertNoProblems }) => {
    await loginAsMember(page, MEMBER_CREDS!);
    await waitForStableLayout(page);

    // Scope to the Achievements card. A page-wide regex for "N/M" would also
    // catch dates and any other slashed number elsewhere in the portal.
    const grid = page.locator("div").filter({ has: page.getByRole("heading", { name: "Achievements" }) }).last();
    await expect(
      grid,
      "No Achievements card in the portal. BadgeGrid returns null when every category " +
        "is empty, so this also fires if getOwnBadges() came back empty."
    ).toBeVisible({ timeout: 20_000 });

    const text = await grid.innerText();

    // At least one category heading proves the grid grouped rather than rendering
    // one undifferentiated wall.
    expect(
      text,
      "No badge category headings (Hitos/Constancia/Estilos/Técnica/Comunidad) inside " +
        "the Achievements card."
    ).toMatch(/Hitos|Constancia|Estilos|Técnica|Comunidad/);

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
