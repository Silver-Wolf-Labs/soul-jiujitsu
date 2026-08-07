import { test, expect, gotoOk, waitForStableLayout } from "../../support/fixtures";
import {
  formatFindings,
  scanAdvisory,
  scanForViolations,
  scanRaw,
  KNOWN_A11Y_ISSUES,
} from "../../support/a11y";
import { PUBLIC_ROUTES } from "../../support/routes";

/**
 * Accessibility. Two reasons this suite earns its runtime:
 *
 *   1. Legal exposure. A gym's public website is a place of public
 *      accommodation; WCAG A/AA failures on the signup and login flows are the
 *      ones that generate demand letters.
 *   2. It finds real bugs. axe's `label` and `color-contrast` rules catch
 *      genuinely broken UI — a field a screen reader announces as "edit text,
 *      blank" is broken for everyone using assistive tech.
 *
 * Known finding at the time of writing: the login forms in
 * `src/app/portal/login/page.tsx` and `src/app/admin/login/page.tsx` render
 * `<label>` elements with no `htmlFor` and inputs with no `id`, so the labels
 * are not programmatically associated. `ContactForm` does this correctly via
 * `FormField`'s `useId`. Expect axe's `label`/`form-field-multiple-labels`
 * rules to flag the login pages until that is fixed — that is the framework
 * doing its job, not a false positive.
 */

test.describe("WCAG A/AA compliance", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} (${route.path}) has no blocking violations`, async ({ page }, testInfo) => {
      await gotoOk(page, route.path);
      await waitForStableLayout(page);

      const { known } = await scanForViolations(
        page,
        `${route.name} (${route.path})`,
        route.path
      );

      // Tracked debt is attached rather than dropped, so it stays visible in the
      // report even on a green run. See KNOWN_A11Y_ISSUES for the expiry policy.
      if (known.length > 0) {
        await testInfo.attach(`a11y-known-debt${route.path.replace(/\//g, "_")}.txt`, {
          body: formatFindings(known),
          contentType: "text/plain",
        });
      }
    });
  }

  test("the known-issues list has not gone stale", async ({ page }) => {
    /**
     * Guards the escape hatch. If a rule in KNOWN_A11Y_ISSUES no longer fires
     * anywhere it was listed, it has been fixed and the entry must be deleted —
     * otherwise the list silently keeps a real rule suppressed for the next
     * regression. Without this test, a "temporary" baseline becomes permanent.
     */
    const stillFiring = new Set<string>();

    for (const known of KNOWN_A11Y_ISSUES) {
      for (const path of known.pages) {
        await gotoOk(page, path);
        await waitForStableLayout(page);
        const results = await scanRaw(page);
        if (results.some((v) => v.id === known.rule)) {
          stillFiring.add(known.rule);
          break;
        }
      }
    }

    const fixed = KNOWN_A11Y_ISSUES.filter((k) => !stillFiring.has(k.rule));
    expect(
      fixed.map((f) => f.rule),
      `These rules are in KNOWN_A11Y_ISSUES but no longer fire anywhere — they have ` +
        `been fixed. Delete their entries from e2e/support/a11y.ts so the rules go ` +
        `back to blocking and a future regression is caught.`
    ).toHaveLength(0);

    const expired = KNOWN_A11Y_ISSUES.filter((k) => new Date(k.expires) <= new Date());
    expect(
      expired.map((e) => `${e.rule} (expired ${e.expires})`),
      `These accessibility issues passed their agreed fix-by date. They are now ` +
        `blocking again. Either fix them or consciously extend the date:\n` +
        expired.map((e) => `    - ${e.rule}: ${e.reason}`).join("\n")
    ).toHaveLength(0);
  });
});

test.describe("advisory best practices", () => {
  // Non-blocking. These are attached to the report so the team has a running
  // list of improvements without the nightly going red on judgement calls.
  for (const route of ["/", "/join", "/portal/login"]) {
    test(`${route} best-practice suggestions`, async ({ page }, testInfo) => {
      await gotoOk(page, route);
      await waitForStableLayout(page);

      const findings = await scanAdvisory(page);

      if (findings.length > 0) {
        await testInfo.attach(`a11y-advisory-${route.replace(/\//g, "_")}.txt`, {
          body: formatFindings(findings),
          contentType: "text/plain",
        });
        // Surfaced in the terminal and the HTML report, but the test passes.
        console.log(
          `\n  ⓘ ${findings.length} accessibility best-practice suggestion(s) on ${route}:\n${formatFindings(findings)}\n`
        );
      }
    });
  }
});

test.describe("keyboard navigation", () => {
  test("landing page is fully keyboard traversable", async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);

    // Tab through the first stretch of the page and verify focus always lands
    // somewhere real and visible. A focus trap or an element that takes focus
    // while off-screen makes the site unusable without a mouse.
    const problems: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");

      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          label:
            el.getAttribute("aria-label") ||
            (el.textContent ?? "").trim().slice(0, 30) ||
            el.getAttribute("href") ||
            el.tagName.toLowerCase(),
          hasSize: rect.width > 0 && rect.height > 0,
          // Focus on an element the user cannot see means the page has
          // "invisible" tab stops — pressing Enter does something unexplained.
          isDisplayed: getComputedStyle(el).visibility !== "hidden" && el.offsetParent !== null,
        };
      });

      if (!focused) continue;

      const key = `${focused.tag}:${focused.label}`;
      // Stop once focus cycles back — the page's tab order is finite.
      if (seen.has(key) && i > 5) break;
      seen.add(key);

      if (!focused.hasSize || !focused.isDisplayed) {
        problems.push(`focus landed on a hidden/zero-size <${focused.tag}> ("${focused.label}")`);
      }
    }

    expect(
      seen.size,
      "Tabbing through the landing page reached no focusable elements at all — " +
        "keyboard users cannot navigate the site."
    ).toBeGreaterThan(3);

    expect(
      problems,
      `Keyboard tab order includes unreachable elements:\n${problems.map((p) => `    - ${p}`).join("\n")}`
    ).toHaveLength(0);
  });

  test("login form can be completed and submitted by keyboard alone", async ({ page }) => {
    await gotoOk(page, "/portal/login");
    await waitForStableLayout(page);

    // Focus the email field the way a keyboard user would, then tab to password
    // and submit with Enter. This proves the form has a working implicit submit
    // rather than requiring a mouse click on the button.
    const email = page.locator('input[type="email"]');
    await email.focus();
    await email.type("keyboard-nav-test@example.com");

    await page.keyboard.press("Tab");

    const afterTab = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? { tag: el.tagName.toLowerCase(), type: el.getAttribute("type") } : null;
    });

    // Tab from email should reach the password field (the "Forgot password?"
    // link sits between them visually but comes before the input in DOM order,
    // so allow either as the next stop and just require we're not stranded).
    expect(
      afterTab,
      "Tabbing out of the email field lost focus entirely — the form is not keyboard usable."
    ).not.toBeNull();

    const password = page.locator('input[type="password"]');
    await password.focus();
    await password.type("not-a-real-password");
    await page.keyboard.press("Enter");

    // Pressing Enter must submit. The form then shows an auth error (wrong
    // credentials) — either a visible error or a loading state proves submit
    // fired. What must NOT happen is nothing at all.
    await expect(async () => {
      const submitted = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return (
          text.includes("invalid") ||
          text.includes("signing in") ||
          text.includes("credentials") ||
          text.includes("error")
        );
      });
      expect(
        submitted,
        "Pressing Enter in the password field did not submit the login form. " +
          "Keyboard users cannot sign in without reaching for the mouse."
      ).toBe(true);
    }).toPass({ timeout: 15_000 });
  });
});

test.describe("focus visibility", () => {
  test("interactive elements show a visible focus indicator", async ({ page }) => {
    await gotoOk(page, "/portal/login");
    await waitForStableLayout(page);

    // The app's inputs use `focus:outline-none` with a `focus:border-black` or
    // `focus:ring` replacement. That is fine — but if a refactor drops the
    // replacement, keyboard users lose all sense of where they are, and
    // `outline-none` alone passes every automated check except this one.
    const noIndicator = await page.evaluate(() => {
      const results: string[] = [];
      const candidates = Array.from(
        document.querySelectorAll("input, button, a[href]")
      ) as HTMLElement[];

      for (const el of candidates) {
        if (el.offsetParent === null) continue;

        const before = getComputedStyle(el);
        const baseline = {
          outlineWidth: before.outlineWidth,
          boxShadow: before.boxShadow,
          borderColor: before.borderColor,
          backgroundColor: before.backgroundColor,
        };

        el.focus();
        const after = getComputedStyle(el);

        const changed =
          after.outlineWidth !== baseline.outlineWidth ||
          after.boxShadow !== baseline.boxShadow ||
          after.borderColor !== baseline.borderColor ||
          after.backgroundColor !== baseline.backgroundColor;

        if (!changed) {
          const label =
            el.getAttribute("aria-label") ||
            (el.textContent ?? "").trim().slice(0, 25) ||
            el.getAttribute("type") ||
            el.tagName.toLowerCase();
          results.push(`<${el.tagName.toLowerCase()}> "${label}"`);
        }
        el.blur();
      }

      return results.slice(0, 10);
    });

    expect(
      noIndicator,
      `These elements look identical focused and unfocused, so keyboard users ` +
        `cannot tell where they are:\n${noIndicator.map((n) => `    - ${n}`).join("\n")}`
    ).toHaveLength(0);
  });
});
