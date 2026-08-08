# Soul Jiu-Jitsu — Setup Checklist

This repo was forked from the MGD Dallas gym portal
(`Silver-Wolf-Labs/mgdjj`) and re-skinned for Soul Jiu-Jitsu. All
MGD-specific identity, branding, and legal text has been replaced. Anything
still marked `TODO_*` is an **unset placeholder** that must be filled in
before a public deploy.

Verify at any point with:

```bash
npx tsx scripts/smoke-test.ts http://localhost:3000
```

It fails on any leftover MGD string *or* any unreplaced `TODO_` in rendered
HTML.

---

## 1. Gym identity — pick one path

**Path A (recommended): run the bootstrap script.** Writes to the
`site_settings` table, so no code changes and no redeploy.

```bash
npx tsx scripts/bootstrap-gym.ts
```

It prompts for name, city, address, phone, email, timezone, site URL,
Instagram, SEO title/description, and the legal entity name for the waiver.

**Path B: edit the code defaults.** `src/lib/gym-profile.ts` →
`DEFAULT_GYM_PROFILE`. These are the fallbacks used when the DB has no
override. Replace:

| Field | Current placeholder |
|---|---|
| `cityName` | `TODO_CITY` |
| `contact.address` | `TODO_ADDRESS` |
| `contact.city` | `TODO_CITY` |
| `contact.state` | `TODO_STATE` |
| `contact.zip` | `TODO_ZIP` |
| `contact.phone` | `TODO_PHONE` (also update `phoneHref`) |
| `contact.email` | `TODO_EMAIL` |
| `meta.url` | `http://localhost:3000` |
| `social.instagram` / `instagramHandle` | empty (blank hides the link) |

Already set: `gymName` "Soul Jiu-Jitsu", `shortName` "Soul JJ", `logoText`
"SOUL", `timezone` `America/Chicago` (change if not US Central).

---

## 2. Legal text — needs a lawyer, not a find-and-replace

⚠️ **The waiver is a real liability document. Do not ship the placeholder.**

- `supabase/migrations/20240131000000_update_waiver.sql` is the current
  active waiver template. It contains `TODO_LEGAL_ENTITY`,
  `TODO_FULL_ADDRESS`, and `TODO_EMAIL`. The two earlier waiver migrations
  (`...20240117...`, `...20240126...`) are superseded history — they carry the
  same placeholders and are only applied in order on a fresh DB.
- `src/content/privacy.md` and `src/content/terms.md` are **scaffolds**, as
  the banner at the top of each says. The governing-law and
  statute-of-limitations references were de-Texased to "applicable law" /
  "your jurisdiction" — confirm the correct jurisdiction for Soul JJ and have
  an attorney review before launch. `TODO_DOMAIN` appears in the contact
  addresses (`privacy@`, `legal@`).

---

## 3. Infrastructure

1. **Supabase project.** Create it, then apply `supabase/migrations/` in
   filename order (or `supabase/schema.sql` for a single-shot setup).
   `supabase/config.toml` has `project_id = "soul-jiujitsu"`.
2. **Env vars.** Copy `.env.local.example` → `.env.local` and fill in.
   Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. There are no payment-processor keys: the
   profe collects payment in person, and the app only records which plan a
   member is on. Plan prices are stored in `price_cents` and rendered in
   colones by `src/lib/currency.ts`.
3. **Seed data (optional).** `supabase/seed.sql` holds demo schedule, team,
   and blog rows. The instructor roster is now generic ("Guest Instructor")
   and the demo blog/news posts reference a "local open" rather than a real
   event — replace all of it with Soul JJ's actual content.
4. **First admin user.** Supabase dashboard → Authentication → Users → Add
   user, then grant the admin role per `docs/runbook.md`.

---

## 4. Toolchain notes

- **Node >= 22 required for tests.** Vitest imports `styleText` from
  `node:util`; on Node 21 it dies at startup before running anything. The
  native `rolldown` binding also only installs correctly on 22+.
- `npm run lint` passes with pre-existing unused-variable warnings.
- **Two inherited test failures**, present in upstream mgdjj and unrelated to
  re-skinning: `constants.test.ts` and `pricing-colors.test.ts` assert hex
  colour strings, but the colour maps now return `var(--color-*)` CSS
  variables. Worth fixing, but it is an upstream bug.

---

## 5. Not carried over from mgdjj

Deliberately dropped: `PROJECT_STATUS.md` (MGD's running status log) and
`mgd-v2 (1).html` (an old MGD design mockup). `docs/` was kept — note
`.gitignore` excludes `/docs/`, so those files are untracked here as well.
