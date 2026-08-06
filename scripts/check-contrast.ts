import { THEMES } from "../src/lib/themes/registry";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function grade(ratio: number): string {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-lg";
  return "FAIL";
}

const white = "#ffffff";
const black = "#000000";
const themes = Array.from(THEMES.values());

let totalFails = 0;

for (const theme of themes) {
  console.log(`\n=== ${theme.name.toUpperCase()} (${theme.id}) ===`);
  console.log(`Tone: ${theme.tone} | Roles: ${Object.values(theme.roles).join(", ")}`);

  const s = theme.slots;

  const checks: [string, string, string, string][] = [
    // [label, foreground, background, context]
    ["Primary on white (bg-only)", s.yellow, white, "BG color — low ratio OK"],
    ["Primary on black", s.yellow, black, "Dark UI buttons"],
    ["Primary-dark on primary-light", s.yellowDark, s.yellowLight, "Tag text on tag bg"],
    ["Info on white", s.blue, white, "Links, info badges"],
    ["Info on info-card", s.blue, s.blueCard, "Schedule Gi card text"],
    ["Accent on white", s.purple, white, "No-Gi badges"],
    ["Accent on accent-card", s.purple, s.purpleCard, "Schedule No-Gi card"],
    ["Warm on white", s.brown, white, "Youth badges"],
    ["Warm on warm-card", s.brown, s.brownCard, "Schedule Youth card"],
    ["Danger on white", s.statusError, white, "Error text"],
    ["Danger on danger-light", s.statusError, s.statusErrorLight, "Error badge"],
    ["Danger-dark on danger-light", s.dangerDark, s.statusErrorLight, "Dark error text"],
    ["Success on white", s.statusSuccess, white, "Success text"],
    ["Success on success-light", s.statusSuccess, s.statusSuccessLight, "Success badge"],
    ["Success-dark on success-light", s.successDark, s.statusSuccessLight, "Dark success text"],
    ["Ink on white", s.ink, white, "Body text"],
    ["Ink on off-white", s.ink, s.offWhite, "Body on alt bg"],
    ["Ink on paper", s.ink, s.paper, "Body on card bg"],
    ["Muted on white", s.muted, white, "Secondary text"],
  ];

  let fails = 0;
  for (const [label, fg, bg, context] of checks) {
    const r = contrast(fg, bg);
    const g = grade(r);
    const isBgOnly = label.includes("bg-only");
    const flag = g === "FAIL" && !isBgOnly ? " *** FAIL ***" : g === "FAIL" && isBgOnly ? " (bg-only, OK)" : "";
    if (g === "FAIL" && !isBgOnly) fails++;
    console.log(
      `  ${label.padEnd(34)} ${r.toFixed(2).padStart(6)} ${g.padEnd(5)} ${flag ? flag : `(${context})`}`
    );
  }

  if (fails === 0) console.log("  ✅ ALL PASS");
  else {
    console.log(`  ❌ ${fails} FAIL(s)`);
    totalFails += fails;
  }
}

console.log(`\n${"=".repeat(60)}`);
if (totalFails === 0) console.log("✅ ALL THEMES PASS CONTRAST CHECKS");
else console.log(`❌ ${totalFails} total failures across all themes`);
