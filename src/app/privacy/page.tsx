import fs from "node:fs/promises";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Soul JJ",
  description: "How Soul JJ collects, uses, and protects your personal information.",
};

// Serve from a markdown file so the owner can edit content without a
// redeploy (Amplify preview rebuilds on any commit including content
// changes, but the diff is trivial and non-code).
async function loadContent(): Promise<string> {
  const p = path.join(process.cwd(), "src/content/privacy.md");
  const raw = await fs.readFile(p, "utf-8");
  // Replace the `{{last_updated}}` placeholder with the file's mtime.
  const stat = await fs.stat(p);
  const updated = stat.mtime.toISOString().slice(0, 10);
  return raw.replace(/\{\{last_updated\}\}/g, updated);
}

export default async function PrivacyPage() {
  const md = await loadContent();
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <article className="prose prose-slate prose-sm max-w-none">
        <ReactMarkdown>{md}</ReactMarkdown>
      </article>
    </main>
  );
}
