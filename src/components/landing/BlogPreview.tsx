import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, estimateReadTime } from "@/lib/utils";
import SectionHeader from "@/components/ui/SectionHeader";
import CardScroller from "@/components/ui/CardScroller";
import type { BlogPost } from "@/lib/supabase/types";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

const FALLBACK_POSTS: BlogPost[] = [
  { id: 1, title: "Cómo sobrevivir a tu primera semana de jiu jitsu", slug: "primera-semana", body: "Todos los cinturones negros sobrevivieron a su primera semana. Guía práctica para empezar sin miedo: qué esperar, qué llevar y cómo cuidar tu cuerpo.", tag: "Beginner", author: "Soul", excerpt: "Todos los cinturones negros sobrevivieron a su primera semana.", published: true, created_at: "2026-08-01", starts_at: null, expires_at: null, display_order: 0 },
  { id: 2, title: "¿Gi o No-Gi? Por cuál empezar", slug: "gi-o-nogi", body: "El clásico debate, explicado para principiantes.", tag: "Beginner", author: "Soul", excerpt: "El clásico debate, explicado para quienes empiezan.", published: true, created_at: "2026-07-20", starts_at: null, expires_at: null, display_order: 0 },
  { id: 3, title: "Por qué el jiu jitsu es para todos", slug: "jiu-jitsu-para-todos", body: "Técnica sobre fuerza: el arte suave no distingue tamaño ni edad.", tag: "News", author: "Soul", excerpt: "Técnica sobre fuerza: el arte suave no distingue tamaño ni edad.", published: true, created_at: "2026-07-10", starts_at: null, expires_at: null, display_order: 0 },
  { id: 4, title: "La importancia del open mat", slug: "open-mat", body: "Rodar libre es donde la técnica se vuelve instinto.", tag: "Technique", author: "Soul", excerpt: "Rodar libre es donde la técnica se vuelve instinto.", published: true, created_at: "2026-07-01", starts_at: null, expires_at: null, display_order: 0 },
];

export default async function BlogPreview({ sectionConfig }: Props) {
  let posts = FALLBACK_POSTS;

  try {
    const supabase = createClient();
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("published", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      // Manual pins via display_order (ASC, non-zero first) take precedence,
      // untouched posts (display_order = 0) stay chronological.
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(4);
    if (data && data.length > 0) posts = data as BlogPost[];
  } catch {
    // Use fallback
  }

  const [featured, ...sidebarPosts] = posts;

  return (
    <section id="blog" className="py-14 px-5 nav:px-12">
      <SectionHeader
        tag={sectionConfig?.display_subtitle ?? "Desde el tatami"}
        title={sectionConfig?.display_title ?? "Blog"}
        subtitle="Técnica, historias y noticias de la comunidad Soul."
        className="mb-6"
      />

      {/* Mobile: swipeable carousel of all posts */}
      <div className="nav:hidden">
        <CardScroller cols={3} gap="gap-4">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="no-underline">
              <article className="bg-white border border-line rounded-lg overflow-hidden hover:shadow-md transition-shadow duration-200 cursor-pointer h-full flex flex-col">
                <div className="h-[120px] bg-gradient-to-br from-black to-blog-end flex items-center justify-center">
                  <span className="font-display font-soul text-[44px] text-white/[0.07]">SOUL</span>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <span className="inline-block self-start text-[10px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-full bg-yellow-light text-yellow-deep border border-yellow-border mb-2">
                    {post.tag}
                  </span>
                  <h3 className="text-[15px] font-bold text-ink leading-snug mb-2 line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-[13px] text-muted leading-relaxed line-clamp-2 flex-1">
                    {post.excerpt}
                  </p>
                  <div className="flex gap-3 text-[11px] text-muted mt-3 pt-3 border-t border-line">
                    <span>{post.author}</span>
                    <span>{formatDate(post.created_at)}</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </CardScroller>
      </div>

      {/* Desktop: featured + sidebar layout */}
      <div className="hidden nav:grid grid-cols-[1.6fr_1fr] gap-6">
        {featured && (
          <Link href={`/blog/${featured.slug}`} className="no-underline">
            <article className="bg-white border border-line rounded-lg overflow-hidden hover:shadow-xl transition-shadow duration-200 cursor-pointer h-full">
              <div className="h-[260px] bg-gradient-to-br from-black to-blog-end flex items-center justify-center">
                <span className="font-display font-soul text-[72px] text-white/[0.07]">SOUL</span>
              </div>
              <div className="p-7">
                <span className="inline-block text-[10px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-full bg-yellow-light text-yellow-deep border border-yellow-border mb-3">
                  {featured.tag}
                </span>
                <h3 className="text-[22px] font-bold text-ink leading-snug mb-2.5">
                  {featured.title}
                </h3>
                <p className="text-[14px] text-muted leading-relaxed">
                  {featured.excerpt}
                </p>
                <div className="flex gap-4 text-xs text-muted mt-4">
                  <span>Por {featured.author}</span>
                  <span>{formatDate(featured.created_at)}</span>
                  <span>{estimateReadTime(featured.body)}</span>
                </div>
              </div>
            </article>
          </Link>
        )}

        <div className="flex flex-col gap-4">
          {sidebarPosts.map((post, i) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="no-underline">
              <article className="bg-white border border-line rounded-lg p-5 hover:shadow-md transition-shadow duration-200 cursor-pointer flex gap-4 items-start">
                <div className="font-display text-[32px] text-line-dark leading-none flex-shrink-0">
                  {String(i + 2).padStart(2, "0")}
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-ink leading-snug mb-1">
                    {post.title}
                  </div>
                  <div className="text-[11px] text-muted font-mono">
                    {formatDate(post.created_at)} · {post.tag}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
