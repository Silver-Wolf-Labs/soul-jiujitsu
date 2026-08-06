-- Blog: add display_order for manual pinning / reordering in admin.
--
-- Ordering strategy mirrors membership_plans / team / sections:
--   ORDER BY display_order ASC, created_at DESC
-- So posts with a manually set display_order surface above the auto-sorted
-- "untouched" pool (which stays chronological via created_at).
--
-- Default is 0 — new posts join the unpinned pool unless the admin promotes
-- them via the reorder arrows in /admin/blog.

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Backfill: leave everything at 0. Admins opt in by pressing the arrows.

-- Index to keep the public feed fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_blog_posts_display_order
  ON blog_posts (display_order, created_at DESC);
