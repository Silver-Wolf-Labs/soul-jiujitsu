# Soul Jiu-Jitsu — Gym Portal

A production-ready gym website and admin panel built with **Next.js 15**, **Supabase**, and **Tailwind CSS**.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database + Auth | Supabase (Postgres + Row Level Security) |
| Styling | Tailwind CSS v3 (custom design system) |
| Hosting | AWS Amplify (Vercel config also present) |
| Tests | Vitest (pure functions only) |

---

## Project Structure

```
src/
├── app/                  # Next.js App Router pages
│   ├── page.tsx          # Public landing page
│   ├── team/[slug]/      # Team member profile
│   ├── blog/[slug]/      # Blog post (Markdown)
│   └── admin/            # Admin panel (auth-guarded)
├── components/
│   ├── landing/          # Public site sections
│   ├── admin/            # Admin UI components
│   └── ui/               # Shared UI primitives
├── lib/
│   ├── gym-profile.ts    # ← Gym identity (DB-backed, see SETUP.md)
│   ├── constants.ts      # Enums, class configs, FAQ data
│   ├── utils.ts          # Pure helper functions
│   ├── actions/          # Server actions (mutations)
│   └── supabase/         # Client + server Supabase setup
supabase/
├── schema.sql            # All tables + RLS policies
└── seed.sql              # Sample data
```

---

## Configuration & Re-skinning

Gym identity (name, tagline, address, contact, social, SEO) is stored in the
`site_settings` table and read through `src/lib/gym-profile.ts`, which falls
back to `DEFAULT_GYM_PROFILE` in that same file when the DB has no override.

To configure a deployment, run:

```bash
npx tsx scripts/bootstrap-gym.ts
```

**New here?** This repo was forked from the MGD Dallas portal and re-skinned.
Read **[SETUP.md](./SETUP.md)** first — it lists every remaining `TODO_`
placeholder, including the waiver and legal pages that still need attorney
review.

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/Silver-Wolf-Labs/soul-jiujitsu.git
cd soul-jiujitsu
npm install
```

### 2. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New project.

### 3. Run the schema

In the Supabase SQL editor, paste and run `supabase/schema.sql`.

### 4. (Optional) Run seed data

In the Supabase SQL editor, paste and run `supabase/seed.sql` to populate sample schedule, team, blog, and settings data.

### 5. Create the first admin user

In the Supabase dashboard → Authentication → Users → "Add user", or use the SQL editor:

```sql
-- Replace with real credentials
SELECT auth.create_user(
  '{"email": "admin@yourgym.com", "password": "your-secure-password"}'
);
```

### 6. Set environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Both values are in: Supabase dashboard → Settings → API.

### 7. Run locally

```bash
npm run dev
```

- Public site: [http://localhost:3000](http://localhost:3000)
- Admin panel: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## Vercel Deployment

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → New Project → import your repo.
3. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Vercel auto-detects Next.js — no extra config needed.

---

## Supabase Storage (Team Photos)

To host team photos in Supabase Storage instead of pasting external URLs:

1. Supabase dashboard → Storage → New bucket → name: `team-photos` → set to **Public**.
2. Upload images via the dashboard or any Supabase client.
3. Copy the public URL (`https://<project>.supabase.co/storage/v1/object/public/team-photos/<filename>`) and paste it into the admin Team editor's "Photo URL" field.

The `next.config.mjs` already includes the Supabase `*.supabase.co` domain in `remotePatterns`.

---

## Google Maps Embed

1. Go to [Google Maps](https://maps.google.com) and search the gym address.
2. Click Share → Embed a map → Copy HTML.
3. Extract the `src` URL from the iframe tag.
4. Save it as the `contact_map_embed` key in `site_settings` (admin panel → Location).

---

## Instagram Feed

The Instagram grid in `src/components/landing/InstagramGrid.tsx` is currently a placeholder. To connect a real feed:

1. Create a Meta developer app with Instagram Basic Display API access.
2. Get a long-lived access token for the gym's Instagram account.
3. Store the token as an env var or in `site_settings`.
4. Replace `InstagramGrid.tsx` with a server component that fetches from:
   `https://graph.instagram.com/me/media?fields=id,media_url,permalink&access_token=TOKEN`

---

## Admin Panel

| Route | Purpose |
|---|---|
| `/admin` | Dashboard — stats at a glance |
| `/admin/schedule` | Add/edit/delete classes by day |
| `/admin/updates` | News, alerts, events |
| `/admin/team` | Coach profiles, reorder, belt + photo |
| `/admin/blog` | Markdown blog posts |
| `/admin/subscribers` | Email + SMS list, CSV export |
| `/admin/contacts` | Form submissions, mark read |
| `/admin/settings` | Alert banner on/off + text |

---

## Running Tests

```bash
npm run test          # run once
npm run test:watch    # watch mode
```

Tests cover: date formatting, slug generation, initials extraction, today detection, CSV generation, enum values, config completeness, and FAQ item count.

---

## Database Schema (Summary)

| Table | Purpose |
|---|---|
| `schedule` | Class schedule entries |
| `updates` | News/alert/event posts |
| `team` | Coach and guest profiles |
| `blog_posts` | Markdown blog articles |
| `subscribers` | Email and SMS opt-ins |
| `contact_submissions` | Contact form messages |
| `site_settings` | Key/value config (alert banner, etc.) |

Full schema with RLS policies is in `supabase/schema.sql`.
