-- ─────────────────────────────────────────────────────────────────
-- Soul Jiu-Jitsu Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────

-- Enable UUID extension (already enabled on Supabase by default)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── site_settings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- ── updates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS updates (
  id        BIGSERIAL PRIMARY KEY,
  type      TEXT NOT NULL CHECK (type IN ('alert', 'event', 'class', 'news')),
  title     TEXT NOT NULL,
  body      TEXT NOT NULL DEFAULT '',
  date      DATE NOT NULL DEFAULT CURRENT_DATE,
  published BOOLEAN NOT NULL DEFAULT true
);

-- ── schedule ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule (
  id     BIGSERIAL PRIMARY KEY,
  day    TEXT NOT NULL CHECK (day IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  time   TEXT NOT NULL,
  name   TEXT NOT NULL,
  type   TEXT NOT NULL CHECK (type IN ('gi','nogi','youth','openmat','special')),
  level  TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true
);

-- ── team ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT '',
  belt      TEXT NOT NULL DEFAULT 'black' CHECK (belt IN ('white','blue','purple','brown','black')),
  bio       TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  slug      TEXT NOT NULL UNIQUE,
  "order"   INT NOT NULL DEFAULT 0,
  type      TEXT NOT NULL DEFAULT 'instructor' CHECK (type IN ('head_coach','instructor','guest'))
);

-- ── blog_posts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id         BIGSERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  body       TEXT NOT NULL DEFAULT '',
  tag        TEXT NOT NULL DEFAULT 'News',
  author     TEXT NOT NULL DEFAULT '',
  excerpt    TEXT NOT NULL DEFAULT '',
  published  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── subscribers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscribers (
  id         BIGSERIAL PRIMARY KEY,
  value      TEXT NOT NULL,
  mode       TEXT NOT NULL CHECK (mode IN ('email', 'sms')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── contact_submissions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_submissions (
  id         BIGSERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read       BOOLEAN NOT NULL DEFAULT false
);

-- ─────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE site_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE updates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule            ENABLE ROW LEVEL SECURITY;
ALTER TABLE team                ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- site_settings: public read, authenticated write
CREATE POLICY "public_read_settings"
  ON site_settings FOR SELECT TO anon USING (true);
CREATE POLICY "admin_write_settings"
  ON site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updates: public read published, authenticated full CRUD
CREATE POLICY "public_read_updates"
  ON updates FOR SELECT TO anon USING (published = true);
CREATE POLICY "admin_all_updates"
  ON updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- schedule: public read active, authenticated full CRUD
CREATE POLICY "public_read_schedule"
  ON schedule FOR SELECT TO anon USING (active = true);
CREATE POLICY "admin_all_schedule"
  ON schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- team: public read, authenticated full CRUD
CREATE POLICY "public_read_team"
  ON team FOR SELECT TO anon USING (true);
CREATE POLICY "admin_all_team"
  ON team FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- blog_posts: public read published, authenticated full CRUD
CREATE POLICY "public_read_blog"
  ON blog_posts FOR SELECT TO anon USING (published = true);
CREATE POLICY "admin_all_blog"
  ON blog_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- subscribers: no public read, public insert, authenticated full access
CREATE POLICY "public_insert_subscribers"
  ON subscribers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_all_subscribers"
  ON subscribers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- contact_submissions: public insert, authenticated read/update
CREATE POLICY "public_insert_contacts"
  ON contact_submissions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_all_contacts"
  ON contact_submissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_updates_published  ON updates (published, date DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_day       ON schedule (day, active);
CREATE INDEX IF NOT EXISTS idx_team_order         ON team ("order");
CREATE INDEX IF NOT EXISTS idx_blog_published     ON blog_posts (published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_slug          ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_team_slug          ON team (slug);
CREATE INDEX IF NOT EXISTS idx_contacts_read      ON contact_submissions (read, created_at DESC);
