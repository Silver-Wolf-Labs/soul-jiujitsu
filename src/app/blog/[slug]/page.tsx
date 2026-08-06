export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/server";
import { formatDate, estimateReadTime } from "@/lib/utils";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import type { BlogPost } from "@/lib/supabase/types";

const FALLBACK_POSTS: BlogPost[] = [
  {
    id: 1,
    title: "Why the Guillotine is the Most Underrated Submission in No-Gi",
    slug: "guillotine-submission",
    body: "## The High Elbow Guillotine\n\nRob breaks down the high elbow guillotine — how to set it up off a failed double leg, why most people squeeze wrong, and three grip variations to drill this week.\n\n### Setup Off the Failed Double Leg\n\nMost guillotines are caught opportunistically. But the *best* ones are set up deliberately from a failed shot.\n\n### Why Most People Squeeze Wrong\n\nThe common mistake is squeezing with the bicep. The correct mechanic uses the forearm blade against the carotid.\n\n### Three Grip Variations\n\n1. **Standard grip** — for beginners\n2. **High elbow** — for tighter necks\n3. **Arm-in** — the highest percentage finish",
    tag: "Technique",
    author: "Rob Ables",
    excerpt: "Rob breaks down the high elbow guillotine.",
    published: true,
    created_at: "2026-03-20",
    starts_at: null,
    expires_at: null,
    display_order: 0,
  },
  {
    id: 2,
    title: "3 Things We Learned from the Texas Open",
    slug: "texas-open-recap",
    body: "## Competition Day Lessons\n\nThree Soul JJ competitors medaled at the Texas Open last weekend.\n\n### 1. Conditioning Wins Matches\n\n### 2. Trust Your A-Game\n\n### 3. Competition Exposes Weaknesses Early",
    tag: "Competition",
    author: "Rob Ables",
    excerpt: "Three Soul JJ competitors medaled at the Texas Open.",
    published: true,
    created_at: "2026-03-18",
    starts_at: null,
    expires_at: null,
    display_order: 0,
  },
  {
    id: 3,
    title: "How to Survive Your First Week of BJJ Without Dying",
    slug: "first-week-bjj",
    body: "## Welcome to the Mats\n\nEvery black belt was once a white belt who survived their first week.\n\n### Show Up Consistently\n\n### Tap Early, Tap Often\n\n### Ask Questions",
    tag: "Beginner",
    author: "Rob Ables",
    excerpt: "Every black belt survived their first week.",
    published: true,
    created_at: "2026-03-10",
    starts_at: null,
    expires_at: null,
    display_order: 0,
  },
  {
    id: 4,
    title: "Gi vs No-Gi: Which Should You Train First?",
    slug: "gi-vs-nogi",
    body: "## The Classic Debate\n\nNew students always ask: *Gi or No-Gi?*\n\n### Train Gi If...\n\n### Train No-Gi If...\n\n### The Best Answer: Train Both",
    tag: "Beginner",
    author: "Rob Ables",
    excerpt: "We break down the classic debate for new students.",
    published: true,
    created_at: "2026-02-28",
    starts_at: null,
    expires_at: null,
    display_order: 0,
  },
];

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let post: BlogPost | null = null;

  try {
    const supabase = createClient();
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("published", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .single();
    if (data) post = data as BlogPost;
  } catch {
    post = FALLBACK_POSTS.find((p) => p.slug === slug) ?? null;
  }

  if (!post) notFound();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        {/* Back link */}
        <div className="px-5 nav:px-12 pt-10">
          <Link
            href="/#blog"
            className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />Back to Blog
          </Link>
        </div>

        {/* Hero area */}
        <div className="px-5 nav:px-12 pt-10 pb-0">
          <div className="max-w-3xl">
            {/* Tag */}
            <span className="inline-block text-[10px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-full bg-yellow-light text-yellow-deep border border-yellow-border mb-6">
              {post.tag}
            </span>

            {/* Title */}
            <h1 className="font-display text-[clamp(40px,6vw,72px)] text-black leading-[0.95] mb-6">
              {post.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap gap-4 text-sm text-muted font-mono mb-10 pb-10 border-b border-line">
              <span>By {post.author}</span>
              <span>{formatDate(post.created_at)}</span>
              <span>{estimateReadTime(post.body)}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 nav:px-12 py-10">
          <div className="max-w-3xl">
            <div className="prose prose-lg max-w-none prose-headings:font-display prose-headings:tracking-wide prose-headings:text-black prose-p:text-muted prose-p:leading-relaxed prose-li:text-muted prose-strong:text-ink prose-a:text-blue-mid">
              <ReactMarkdown>{post.body}</ReactMarkdown>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
