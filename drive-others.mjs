import { chromium } from "@playwright/test";

const BASE = "http://localhost:3210";
const OUT = "/tmp/join-shots";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

// ── Forgot password ───────────────────────────────────────────────────────
console.log("═══ /portal/forgot-password ═══");
for (const email of ["nobody@example.com", "walter@souljj.team", "segura2794@gmail.com"]) {
  await page.goto(`${BASE}/portal/forgot-password`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("button", { name: /send reset link/i }).click();
  await page.waitForTimeout(4000);

  const body = await page.locator("body").innerText();
  const sent = /check your email/i.test(body);
  const err = await page.locator("p.text-danger").filter({ visible: true }).allInnerTexts();

  console.log(`\n  ${email}`);
  console.log(`    sent state: ${sent}`);
  console.log(`    error:      ${err.filter(Boolean).join(" | ") || "(none)"}`);
  await page.screenshot({ path: `${OUT}/forgot-${email.split("@")[1]}.png` });
}

// ── Subscribe form on the landing page ────────────────────────────────────
console.log("\n═══ landing #subscribe ═══");
for (const email of ["bot@example.com", "fabrizio@gmial.com", "real.person@gmail.com"]) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const section = page.locator("#subscribe");
  if (await section.count() === 0) { console.log("  (subscribe section hidden)"); break; }

  await section.locator("#subscribe-input").fill(email);
  await section.getByRole("button", { name: /suscribirme/i }).click();
  await page.waitForTimeout(4000);

  const text = await section.innerText();
  const ok = /¡Listo!/i.test(text);
  const errLine = text.split("\n").find((l) => /no recibe correo|reservado|no puede recibir|válido/i.test(l));

  console.log(`\n  ${email}`);
  console.log(`    success:  ${ok}`);
  console.log(`    error:    ${errLine ?? "(none)"}`);
  await page.screenshot({ path: `${OUT}/subscribe-${email.split("@")[1]}.png` });
}

await browser.close();
