import fs from "node:fs/promises";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Soul JJ",
  description: "The terms and conditions for using Soul JJ's services.",
};

async function loadContent(): Promise<string> {
  const p = path.join(process.cwd(), "src/content/terms.md");
  const raw = await fs.readFile(p, "utf-8");
  const stat = await fs.stat(p);
  const updated = stat.mtime.toISOString().slice(0, 10);
  return raw.replace(/\{\{last_updated\}\}/g, updated);
}

export default async function TermsPage() {
  const md = await loadContent();
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <article className="prose prose-slate prose-sm max-w-none">
        <ReactMarkdown>{md}</ReactMarkdown>
      </article>
    </main>
  );
}
