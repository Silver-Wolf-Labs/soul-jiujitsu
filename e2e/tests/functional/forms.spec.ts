import { test, expect, gotoOk, waitForStableLayout } from "../../support/fixtures";

/**
 * Form behaviour: validation, error surfacing, and the honeypot.
 *
 * These specs deliberately avoid submitting anything that writes a real row —
 * a nightly run must not add 365 junk subscribers a year to the gym's list.
 * Where a write is unavoidable to prove the path works, the test uses an
 * address in the reserved `example.com` domain and is marked so the team can
 * filter it out. What is tested here is the *client-side contract*: required
 * fields block submission, invalid input is rejected, and errors are shown to
 * the user rather than swallowed.
 */

test.describe("contact form", () => {
  test.beforeEach(async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);
    const contact = page.locator("#contact");
    test.skip((await contact.count()) === 0, "Contact section is hidden in site_sections");
    await contact.scrollIntoViewIfNeeded();
  });

  test("required fields block an empty submit", async ({ page }) => {
    const form = page.locator("#contact form").first();
    await expect(form, "The contact section has no form").toBeVisible();

    await form.getByRole("button", { name: /enviar mensaje/i }).click();

    // Native `required` validation should stop the submit. If it does not, the
    // server action receives an empty payload — and `submitContact` would then
    // be the only thing standing between a bot and the contacts table.
    const firstInvalid = form.locator("input:invalid, textarea:invalid").first();
    await expect(
      firstInvalid,
      "Submitting the empty contact form did not trigger validation on any field — " +
        "the required attributes are missing or the form submits regardless."
    ).toHaveCount(1, { timeout: 3_000 });

    // And the success state must not appear.
    await expect(
      page.getByText(/mensaje enviado/i),
      "The contact form showed its success state despite being empty."
    ).toHaveCount(0);
  });

  test("all fields are labelled and keyboard reachable", async ({ page }) => {
    const form = page.locator("#contact form").first();

    // `FormField` wires `htmlFor`/`id` via useId, so every visible field here
    // should have an accessible name. A field without one is unusable with a
    // screen reader and unfindable by `getByLabel` in future tests.
    const unlabelled = await form
      .locator("input:not([type=hidden]), textarea, select")
      .evaluateAll((els) =>
        els
          .filter((el) => {
            // The honeypot is `display: none` and intentionally has no label.
            if ((el as HTMLElement).offsetParent === null) return false;
            const id = el.getAttribute("id");
            const hasLabel = id
              ? !!el.ownerDocument.querySelector(`label[for="${id}"]`)
              : false;
            const hasAria =
              el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
            return !hasLabel && !hasAria;
          })
          .map((el) => el.getAttribute("name") || el.tagName.toLowerCase())
      );

    expect(
      unlabelled,
      `Contact form fields with no accessible label: ${unlabelled.join(", ")}`
    ).toHaveLength(0);
  });

  test("email field rejects a malformed address", async ({ page }) => {
    const form = page.locator("#contact form").first();

    await form.locator('input[name="first_name"]').fill("E2E");
    await form.locator('input[name="last_name"]').fill("Test");
    await form.locator('input[name="email"]').fill("not-an-email");
    await form.locator('textarea[name="message"]').fill("Automated nightly UI check.");

    await form.getByRole("button", { name: /enviar mensaje/i }).click();

    const emailValid = await form
      .locator('input[name="email"]')
      .evaluate((el) => (el as HTMLInputElement).checkValidity());

    expect(
      emailValid,
      'The email field accepted "not-an-email" as valid. type="email" is missing ' +
        "or has been overridden."
    ).toBe(false);

    await expect(
      page.getByText(/mensaje enviado/i),
      "The contact form reported success with an invalid email address."
    ).toHaveCount(0);
  });

  test("honeypot field is hidden from real users", async ({ page }) => {
    const honeypot = page.locator('#contact form input[name="website"]');
    await expect(honeypot, "The contact form has lost its honeypot field").toHaveCount(1);

    // A honeypot that becomes visible starts catching real users and silently
    // discarding their messages — a failure mode that looks like nothing at all.
    await expect(
      honeypot,
      "The honeypot field is visible to users. Real submissions will be dropped as spam."
    ).toBeHidden();

    const tabIndex = await honeypot.getAttribute("tabindex");
    expect(
      tabIndex,
      'The honeypot must keep tabindex="-1" so keyboard users never land on it.'
    ).toBe("-1");
  });
});

test.describe("subscribe form", () => {
  test.beforeEach(async ({ page }) => {
    await gotoOk(page, "/");
    await waitForStableLayout(page);
    const subscribe = page.locator("#subscribe");
    test.skip((await subscribe.count()) === 0, "Subscribe section is hidden in site_sections");
    await subscribe.scrollIntoViewIfNeeded();
  });

  test("Email / SMS toggle switches the input type", async ({ page }) => {
    const section = page.locator("#subscribe");
    const input = section.locator("#subscribe-input");

    await expect(input, "Subscribe input not found").toBeVisible();
    await expect(
      input,
      "The subscribe form should start in Email mode"
    ).toHaveAttribute("type", "email");

    await section.getByRole("button", { name: /^sms$/i }).click();

    // Switching to SMS must change `type` to `tel` — otherwise mobile users get
    // the wrong keyboard and the browser rejects a valid phone number as an
    // invalid email.
    await expect(
      input,
      'Switching to SMS mode did not change the input to type="tel". ' +
        "Mobile users get an email keyboard and the field rejects phone numbers."
    ).toHaveAttribute("type", "tel");

    await section.getByRole("button", { name: /^correo$/i }).click();
    await expect(input).toHaveAttribute("type", "email");
  });

  test("switching mode clears any typed value", async ({ page }) => {
    const section = page.locator("#subscribe");
    const input = section.locator("#subscribe-input");

    await input.fill("someone@example.com");
    await section.getByRole("button", { name: /^sms$/i }).click();

    // Carrying an email address into the phone field would submit it as a phone
    // number. `SubscribeForm` resets `value` on mode change; this locks it in.
    await expect(
      input,
      "Switching from Email to SMS kept the typed email in the phone field."
    ).toHaveValue("");
  });

  test("empty submit is blocked", async ({ page }) => {
    const section = page.locator("#subscribe");
    await section.getByRole("button", { name: /suscribirme/i }).click();

    await expect(
      section.locator("#subscribe-input:invalid"),
      "The subscribe form submitted with an empty value."
    ).toHaveCount(1, { timeout: 3_000 });
  });

  test("honeypot is present and hidden", async ({ page }) => {
    const honeypot = page.locator('#subscribe form input[name="website"]');
    await expect(honeypot).toHaveCount(1);
    await expect(
      honeypot,
      "The subscribe honeypot is visible — real signups will be dropped."
    ).toBeHidden();
  });
});

test.describe("join / signup form", () => {
  test("step 1 renders and blocks an empty continue", async ({ page }) => {
    await gotoOk(page, "/join");
    await waitForStableLayout(page);

    const form = page.locator("form").first();
    await expect(form, "The join page rendered no form").toBeVisible();

    // The signup flow is the revenue path: a broken step 1 means no new members
    // can join and nothing else in the app would report it.
    await expect(
      form.locator('input[name="first_name"]'),
      "The join form is missing its first-name field"
    ).toBeVisible();
    await expect(
      form.locator('input[name="email"]'),
      "The join form is missing its email field"
    ).toBeVisible();
    await expect(
      form.locator('input[name="password"]'),
      "The join form is missing its password field"
    ).toBeVisible();

    // `JoinForm` gates the Next button on `disabled` rather than letting the
    // submit fire and showing an error, so "blocked" here means *stays
    // disabled*. Asserting a click is the wrong shape: it just times out.
    const advance = form.getByRole("button", { name: /siguiente|continuar/i }).first();
    test.skip((await advance.count()) === 0, "Step 1 has no continue/next button");

    await expect(
      advance,
      "The join form's Next button is enabled with every field empty — step 1 " +
        "validation is not gating the signup flow."
    ).toBeDisabled();
  });

  test("password confirmation mismatch keeps the form from advancing", async ({ page }) => {
    await gotoOk(page, "/join");
    await waitForStableLayout(page);

    const form = page.locator("form").first();
    const confirm = form.locator('input[name="confirm_password"]');
    test.skip((await confirm.count()) === 0, "No confirm_password field on step 1");

    await form.locator('input[name="first_name"]').fill("E2E");
    await form.locator('input[name="last_name"]').fill("Nightly");
    await form.locator('input[name="email"]').fill(`e2e-nightly@example.com`);
    await form.locator('input[name="password"]').fill("CorrectHorse1!");
    await confirm.fill("DifferentPassword2!");

    // A mismatch must not be advanceable. Silently accepting it would create an
    // account with a password the user does not think they set — a support
    // ticket that is very hard to diagnose.
    const advance = form.getByRole("button", { name: /siguiente|continuar/i }).first();
    await expect(
      advance,
      "The join form allows advancing past step 1 with mismatched passwords."
    ).toBeDisabled();

    // And the user must be told *why* it is blocked, not left guessing at a
    // greyed-out button — that is a dead-end for a paying signup.
    await expect(
      page.getByText(/coinciden/i).first(),
      "Mismatched passwords disable the Next button but show no explanation, so " +
        "the user cannot tell why they are stuck."
    ).toBeVisible({ timeout: 5_000 });

    // Correcting it must unblock the flow. The Next button also gates on the
    // Terms checkbox, so tick that too — otherwise this asserts nothing about
    // the password logic.
    await confirm.fill("CorrectHorse1!");
    const terms = form.locator('input[type="checkbox"]').filter({ visible: true });
    for (let i = 0; i < (await terms.count()); i++) {
      const box = terms.nth(i);
      // Only the required consent box is a gate; ticking an optional marketing
      // opt-in is harmless here since nothing is submitted.
      if (!(await box.isChecked())) await box.check();
    }

    await expect(
      advance,
      "With a valid password, matching confirmation, and consent given, the join " +
        "form's Next button is still disabled — new members cannot sign up."
    ).toBeEnabled({ timeout: 5_000 });
  });

  test("no console errors while filling the signup form", async ({ page, assertNoProblems }) => {
    await gotoOk(page, "/join");
    await waitForStableLayout(page);

    const form = page.locator("form").first();
    await form.locator('input[name="first_name"]').fill("E2E");
    await form.locator('input[name="email"]').fill("e2e-nightly@example.com");

    // The join page mounts a signature canvas and a markdown-rendered waiver;
    // both are common sources of hydration and canvas-sizing errors that never
    // surface in a build.
    assertNoProblems("/join while typing");
  });
});
