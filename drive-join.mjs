import { chromium } from "@playwright/test";

const BASE = "http://localhost:3210";
const OUT = "/tmp/join-shots";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

page.on("console", (m) => {
  if (m.type() === "error") console.log("  [browser error]", m.text());
});

async function fillStep1(email, password = "tapir-vulcanizado-9-jenjibre") {
  await page.goto(`${BASE}/join`, { waitUntil: "networkidle" });
  const form = page.locator("form").first();
  await form.locator('input[name="first_name"]').fill("Fabrizio");
  await form.locator('input[name="last_name"]').fill("Prueba");
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(password);
  await form.locator('input[name="confirm_password"]').fill(password);

  // Terms checkbox gates the Next button.
  const boxes = form.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i);
    if (await b.isVisible() && !(await b.isChecked())) await b.check();
  }
  return form;
}

async function clickNext(form) {
  const next = form.getByRole("button", { name: /siguiente/i }).first();
  await next.click();
  // Give the gate's DNS lookup + server action time to resolve.
  await page.waitForTimeout(4000);
}

function stepNow() {
  // Step 1 shows the password fields; step 2 shows the waiver.
  return page.evaluate(() => {
    const t = document.body.innerText;
    if (document.querySelector('input[name="confirm_password"]')) return "step1";
    if (/consentimiento|exoneraci|waiver/i.test(t)) return "step2";
    return "unknown";
  });
}

async function report(label, email) {
  const step = await stepNow();
  // Scope to the real error paragraph — `.text-danger` also matches the
  // required-field asterisks on every label.
  const err = await page.locator("p.text-danger").filter({ visible: true }).allInnerTexts();
  const suggestion = await page.locator("#email-suggestion").count()
    ? await page.locator("#email-suggestion").innerText()
    : null;
  const emailValue = await page.locator('input[name="email"]').first().inputValue().catch(() => "(gone)");

  console.log(`\n── ${label}  (typed: ${email})`);
  console.log(`   step:       ${step}`);
  console.log(`   email now:  ${emailValue}`);
  console.log(`   error:      ${err.filter(Boolean).join(" | ") || "(none)"}`);
  console.log(`   suggestion: ${suggestion ? suggestion.replace(/\s+/g, " ") : "(none)"}`);
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
  return { step, err, suggestion };
}

// ── 1. Reserved documentation domain — must be REFUSED, stay on step 1 ──
let form = await fillStep1("test@example.com");
await clickNext(form);
const reserved = await report("1-example-com", "test@example.com");

// ── 2. Typo'd common provider — must OFFER a correction, stay on step 1 ──
form = await fillStep1("fabrizio@gmial.com");
await clickNext(form);
const typo = await report("2-gmial-com", "fabrizio@gmial.com");

// ── 3. Accept the suggestion, then continue — must ADVANCE to step 2 ──
if (typo.suggestion) {
  await page.locator("#email-suggestion button").first().click();
  await page.waitForTimeout(300);
  console.log(`   after accepting: ${await page.locator('input[name="email"]').first().inputValue()}`);
  await clickNext(page.locator("form").first());
  await report("3-after-accepting-suggestion", "→ gmail.com");
}

// ── 4. Reserved TLD from this repo's own fixtures ──
form = await fillStep1("member42@souljj.test");
await clickNext(form);
await report("4-souljj-test", "member42@souljj.test");

// ── 5. The legacy bootstrap domain that actually caused the bounces ──
form = await fillStep1("walter.davis@souljj.team");
await clickNext(form);
await report("5-souljj-team", "walter.davis@souljj.team");

// ── 6. A real deliverable address — must ADVANCE to step 2 ──
form = await fillStep1("fabrizio.mendez.test@gmail.com");
await clickNext(form);
await report("6-real-gmail", "fabrizio.mendez.test@gmail.com");

await browser.close();
