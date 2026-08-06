import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Vercel Cron: runs every 15 minutes.
 * Publishes any blog posts where starts_at <= now() AND published = false.
 * Protected by CRON_SECRET env var.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role key to bypass RLS
  const supabase = createServiceClient();

  const now = new Date().toISOString();

  const { data: posts, error: fetchError } = await supabase
    .from("blog_posts")
    .select("id, title, starts_at")
    .eq("published", false)
    .not("starts_at", "is", null)
    .lte("starts_at", now);

  if (fetchError) {
    console.error("[cron/publish-posts] fetch error:", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ published: 0 });
  }

  const ids = posts.map((p: { id: number }) => p.id);

  const { error: updateError } = await supabase
    .from("blog_posts")
    .update({ published: true })
    .in("id", ids);

  if (updateError) {
    console.error("[cron/publish-posts] update error:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // L-3: Log count only — don't leak post IDs to logs
  console.log(`[cron/publish-posts] published ${ids.length} post(s)`);
  return NextResponse.json({ published: ids.length });
}
