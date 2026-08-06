"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { blogPostSchema } from "@/lib/validations/blog";
import { logAuditEvent } from "@/lib/audit";

type BlogPostPayload = {
  title: string; slug: string; body: string; tag: string;
  author: string; excerpt: string; published: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  display_order?: number;
};

export async function createBlogPost(data: BlogPostPayload) {
  await requireAdmin();
  const parsed = blogPostSchema.parse(data);
  const supabase = createClient();
  const { error, data: row } = await supabase.from("blog_posts").insert(parsed).select("id").single();
  if (error) throw new Error(error.message);
  await logAuditEvent("CREATE", "blog_posts", row?.id, { ...parsed });
  revalidatePath("/");
  revalidatePath("/blog");
}

export async function updateBlogPost(id: number, data: BlogPostPayload) {
  await requireAdmin();
  const parsed = blogPostSchema.parse(data);
  const supabase = createClient();
  const { data: before } = await supabase.from("blog_posts").select("*").eq("id", id).single();
  const { error } = await supabase.from("blog_posts").update(parsed).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "blog_posts", id, { before, after: parsed });
  revalidatePath("/");
  revalidatePath(`/blog/${parsed.slug}`);
}

export async function deleteBlogPost(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: before } = await supabase.from("blog_posts").select("*").eq("id", id).single();
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("DELETE", "blog_posts", id, { deleted: before });
  revalidatePath("/");
}

export async function toggleBlogPublished(id: number, published: boolean) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("blog_posts").update({ published }).eq("id", id);
  await logAuditEvent("TOGGLE", "blog_posts", id, { field: "published", from: !published, to: published });
  revalidatePath("/");
}

/**
 * Move a blog post one slot up or down in the admin / public feed order.
 *
 * Why a full renumber instead of a two-row swap:
 *
 * Blog posts default to `display_order = 0` and the list sorts by
 * `display_order ASC, created_at DESC`.  With N posts all at 0, just giving
 * the moving row and its neighbour distinct numbers (e.g. 0 and 1) doesn't
 * produce the intended sort — the other N-2 posts still sit at 0 and slot
 * in between them on the re-sort.  To keep the UI swap and the DB order in
 * sync we rewrite `display_order` for every row as its new sequential
 * position, so the stored order is authoritative and never leans on
 * `created_at` as a tiebreak after the first reorder.
 *
 * New posts created later still come in at display_order 0; they appear at
 * the top of the feed via the created_at secondary sort until someone
 * reorders them, at which point they get renumbered alongside everything
 * else.
 */
export async function reorderBlogPost(id: number, direction: "up" | "down") {
  await requireAdmin();
  const supabase = createClient();

  // Fetch all post IDs in the same order the admin page renders them.
  const { data: rows, error: listErr } = await supabase
    .from("blog_posts")
    .select("id")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (listErr) throw new Error(listErr.message);
  if (!rows) return;

  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;

  // Swap the two IDs in our working copy, then rewrite display_order for
  // the whole list using the array index so the sort is fully determined.
  const ordered = [...rows];
  [ordered[idx], ordered[swapIdx]] = [ordered[swapIdx], ordered[idx]];

  // Apply sequentially. Supabase Postgres REST has no true batch write with
  // per-row values, but the list is small (a single gym's blog) so the cost
  // is negligible.
  for (let i = 0; i < ordered.length; i++) {
    const { error } = await supabase
      .from("blog_posts")
      .update({ display_order: i })
      .eq("id", ordered[i].id);
    if (error) throw new Error(error.message);
  }

  await logAuditEvent("UPDATE", "blog_posts", id, {
    field: "display_order",
    direction,
    swapped_with: ordered[idx].id,
  });
  revalidatePath("/");
}
