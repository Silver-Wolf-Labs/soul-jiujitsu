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
    title: "Cómo sobrevivir a tu primera semana de jiu jitsu",
    slug: "primera-semana",
    body: "## Bienvenido al tatami\n\nTodos los cinturones negros fueron alguna vez cinturones blancos que sobrevivieron a su primera semana.\n\n### Preséntate con constancia\n\nLa mitad del camino es simplemente llegar. Dos o tres clases por semana son suficientes para empezar.\n\n### Tapea temprano, tapea seguido\n\nTapear no es perder: es aprender sin lesionarte. El ego se queda fuera del mat.\n\n### Pregunta todo\n\nLos profesores y compañeros están para ayudarte. Nadie espera que sepas nada el primer día.",
    tag: "Beginner",
    author: "Soul",
    excerpt: "Todos los cinturones negros sobrevivieron a su primera semana.",
    published: true,
    created_at: "2026-08-01",
    starts_at: null,
    expires_at: null,
    display_order: 0,
  },
  {
    id: 2,
    title: "¿Gi o No-Gi? Por cuál empezar",
    slug: "gi-o-nogi",
    body: "## El clásico debate\n\nTodos los alumnos nuevos preguntan: *¿Gi o No-Gi?*\n\n### Entrena Gi si...\n\nTe interesa el jiu jitsu tradicional, los agarres de kimono y un ritmo más técnico.\n\n### Entrena No-Gi si...\n\nPrefieres un ritmo más dinámico, sin agarres de tela.\n\n### La mejor respuesta: entrena ambos\n\nEn Soul tenemos clases de Gi y No-Gi cada semana — combina las dos y tu juego crecerá más rápido.",
    tag: "Beginner",
    author: "Soul",
    excerpt: "El clásico debate, explicado para quienes empiezan.",
    published: true,
    created_at: "2026-07-20",
    starts_at: null,
    expires_at: null,
    display_order: 0,
  },
  {
    id: 3,
    title: "Por qué el jiu jitsu es para todos",
    slug: "jiu-jitsu-para-todos",
    body: "## El arte suave\n\nEl jiu jitsu se basa en la técnica y la palanca, no en la fuerza. Por eso pueden practicarlo personas de cualquier tamaño, edad y condición física.\n\n### Un espacio seguro\n\nEn Soul trabajamos para que todos — y especialmente las mujeres — entrenen con total seguridad, confianza y motivación.",
    tag: "News",
    author: "Soul",
    excerpt: "Técnica sobre fuerza: el arte suave no distingue tamaño ni edad.",
    published: true,
    created_at: "2026-07-10",
    starts_at: null,
    expires_at: null,
    display_order: 0,
  },
  {
    id: 4,
    title: "La importancia del open mat",
    slug: "open-mat",
    body: "## Rodar libre\n\nEl open mat es el espacio donde la técnica se vuelve instinto: sin clase estructurada, solo tatami y compañeros.\n\n### En Soul\n\nViernes 7:00 p.m. (Gi) y sábados 12:00 m.d. (No-Gi). Llega, salúdate con todos y a rodar.",
    tag: "Technique",
    author: "Soul",
    excerpt: "Rodar libre es donde la técnica se vuelve instinto.",
    published: true,
    created_at: "2026-07-01",
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
            <ArrowLeft className="w-4 h-4" />Volver al blog
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
              <span>Por {post.author}</span>
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
