import { describe, it, expect } from "vitest";
import {
  checkEmailAddress,
  suggestEmailCorrection,
  normalizeEmail,
} from "../deliverability";

/**
 * These tests exist because of a real incident: Supabase warned that the
 * project's transactional mail was bouncing at a rate high enough to risk
 * suspension of sending privileges. The cause was that nothing validated an
 * address before `signUp()` handed it to the mailer.
 *
 * So the assertions here are deliberately about *deliverability outcomes*,
 * not about pattern-matching for its own sake: every `ok: false` case below
 * is an address that would produce a hard bounce if it reached the mailer.
 */

describe("checkEmailAddress", () => {
  it("accepts ordinary addresses", () => {
    for (const email of [
      "rob@gmail.com",
      "chelsah.lyons@outlook.es",
      "member+bjj@proton.me",
      "info@ice.co.cr",
      "a@b.io",
    ]) {
      const result = checkEmailAddress(email);
      expect(result.ok, `${email} was rejected`).toBe(true);
    }
  });

  it("normalizes case and surrounding whitespace", () => {
    const result = checkEmailAddress("  Rob.Ables@GMAIL.com  ");
    expect(result).toMatchObject({ ok: true, email: "rob.ables@gmail.com" });
  });

  it("rejects addresses the browser's type=email would accept", () => {
    // `type="email"` accepts `a@b` — no dot, no TLD, undeliverable. This is
    // precisely the gap that let bouncing addresses through, so it is the
    // single most important case in this file.
    expect(checkEmailAddress("rob@localhost")).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(checkEmailAddress("rob@gmail")).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects structurally broken addresses", () => {
    for (const email of ["", "   ", "no-at-sign.com", "@gmail.com", "rob@", "rob@.com", "rob@gmail..com", "two@at@signs.com", "rob smith@gmail.com"]) {
      expect(checkEmailAddress(email).ok, `${email} was accepted`).toBe(false);
    }
  });

  it("rejects RFC 2606 documentation domains", () => {
    // The e2e suite and every code sample in the world use these. If one is
    // ever pasted into a live form it bounces.
    for (const email of ["someone@example.com", "e2e@example.net", "x@example.org"]) {
      expect(checkEmailAddress(email)).toMatchObject({
        ok: false,
        reason: "reserved_domain",
      });
    }
  });

  it("rejects reserved TLDs", () => {
    for (const email of ["a@foo.test", "a@foo.invalid", "a@foo.localhost", "a@foo.example"]) {
      const result = checkEmailAddress(email);
      expect(result.ok, `${email} was accepted`).toBe(false);
    }
  });

  it("rejects this repo's own fixture domains", () => {
    // `seed_analytics.ts` mints @souljj.test users and `bootstrap_people.ts`
    // mints @souljj.invalid ones. Neither can receive mail.
    expect(checkEmailAddress("member42@souljj.test")).toMatchObject({
      ok: false,
      reason: "fixture_domain",
    });
    expect(checkEmailAddress("walter.davis@souljj.invalid")).toMatchObject({
      ok: false,
      reason: "fixture_domain",
    });
  });

  it("still rejects the legacy bootstrap domain", () => {
    // `souljj.team` was the bootstrap domain before this fix. It is a real,
    // registrable TLD with no MX record — the worst case, because it looks
    // legitimate and bounces anyway. Any account created before the switch
    // still carries one of these addresses.
    expect(checkEmailAddress("rob.ables@souljj.team")).toMatchObject({
      ok: false,
      reason: "fixture_domain",
    });
  });

  it("returns a typo suggestion alongside an accepted address", () => {
    // A misspelled domain is not refused — it might be real — but the caller
    // gets the suggestion so it can ask.
    const result = checkEmailAddress("rob@gmial.com");
    expect(result).toMatchObject({ ok: true, suggestion: "rob@gmail.com" });
  });

  it("returns no suggestion for an address that is already correct", () => {
    const result = checkEmailAddress("rob@gmail.com");
    expect(result).toMatchObject({ ok: true, suggestion: null });
  });
});

describe("suggestEmailCorrection", () => {
  it("catches the common consumer-provider typos", () => {
    const cases: Array<[string, string]> = [
      ["rob@gmial.com", "rob@gmail.com"],
      ["rob@gmai.com", "rob@gmail.com"],
      ["rob@gmail.cmo", "rob@gmail.com"],
      ["rob@gnail.com", "rob@gmail.com"],
      ["rob@hotmial.com", "rob@hotmail.com"],
      ["rob@hotmail.co", "rob@hotmail.com"],
      ["rob@outlok.com", "rob@outlook.com"],
      ["rob@yaho.com", "rob@yahoo.com"],
      ["rob@iclod.com", "rob@icloud.com"],
    ];

    for (const [input, expected] of cases) {
      expect(suggestEmailCorrection(input), `for ${input}`).toBe(expected);
    }
  });

  it("preserves the local part verbatim, including dots and plus tags", () => {
    expect(suggestEmailCorrection("rob.ables+bjj@gmial.com")).toBe(
      "rob.ables+bjj@gmail.com"
    );
  });

  it("leaves an exact match alone", () => {
    for (const email of ["a@gmail.com", "a@hotmail.com", "a@ice.co.cr"]) {
      expect(suggestEmailCorrection(email), `for ${email}`).toBeNull();
    }
  });

  it("does not rewrite unrelated real domains", () => {
    // False positives are worse than false negatives here: silently
    // "correcting" a member's real company domain sends their confirmation
    // to a stranger. A domain must be a genuine near-miss to be suggested.
    for (const email of [
      "coach@souljiujitsu.cr",
      "admin@silverwolflabs.com",
      "someone@un.org",
      "person@nic.cr",
      "member@fastmail.com",
      "user@zoho.com",
    ]) {
      expect(suggestEmailCorrection(email), `for ${email}`).toBeNull();
    }
  });

  it("does not over-correct short domains on a single edit", () => {
    // `me.com` is in the common list and one edit from several real domains.
    // Short domains get a tighter threshold precisely so this stays null.
    expect(suggestEmailCorrection("a@we.com")).toBeNull();
  });

  it("returns null when there is no domain to inspect", () => {
    expect(suggestEmailCorrection("no-at-sign")).toBeNull();
    expect(suggestEmailCorrection("@gmail.com")).toBeNull();
    expect(suggestEmailCorrection("")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases so stored addresses match on lookup", () => {
    // The suppression table is keyed on a lowercased email, and members.email
    // is written lowercased. A mismatch here means a suppressed address gets
    // mailed anyway.
    expect(normalizeEmail("  ROB@Gmail.COM ")).toBe("rob@gmail.com");
  });
});
