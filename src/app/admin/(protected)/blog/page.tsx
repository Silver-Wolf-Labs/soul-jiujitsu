"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/hooks/useToast";
import {
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  toggleBlogPublished,
  reorderBlogPost,
} from "@/lib/actions/blog";
import { BLOG_TAGS } from "@/lib/constants";
import { formatDate, toSlug, estimateReadTime } from "@/lib/utils";
import MarkdownToolbar from "@/components/admin/MarkdownToolbar";
import AdminViewTransition from "@/components/admin/AdminViewTransition";
import { ReorderButtons } from "@/components/ui/ReorderButtons";
import ErrorToast from "@/components/admin/ErrorToast";
import { useOptimisticReorder } from "@/hooks/useOptimisticReorder";
import type { BlogPost } from "@/lib/supabase/types";

const emptyForm = {
  title: "",
  slug: "",
  body: "",
  tag: "Technique",
  author: "",
  excerpt: "",
  published: false,
  starts_at: "",
  expires_at: "",
};

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { message: toastMessage, showError, dismiss: dismissToast } = useToast();

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      // Must mirror the public feed so the reorder arrows move posts in the
      // same order viewers see them on the landing page.
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    setPosts((data as BlogPost[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setView("edit");
  }

  function openEdit(p: BlogPost) {
    setEditing(p);
    setForm({
      title: p.title,
      slug: p.slug,
      body: p.body,
      tag: p.tag,
      author: p.author,
      excerpt: p.excerpt,
      published: p.published,
      starts_at: p.starts_at ? p.starts_at.slice(0, 16) : "",
      expires_at: p.expires_at ? p.expires_at.slice(0, 16) : "",
    });
    setView("edit");
  }

  async function handleSave() {
    if (!form.title.trim() || !form.slug.trim()) return;
    const editingRef = editing;
    const payload = {
      ...form,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };

    if (editingRef) {
      // Optimistic update
      const optimistic: BlogPost = { ...editingRef, ...payload };
      setPosts((prev) => prev.map((p) => p.id === editingRef.id ? optimistic : p));
      setView("list");
      try {
        await updateBlogPost(editingRef.id, payload);
      } catch {
        setPosts((prev) => prev.map((p) => p.id === editingRef.id ? editingRef : p));
        showError("Failed to save changes. Please try again.");
      }
    } else {
      // Optimistic create — navigate first, sync in background
      setSaving(true);
      setView("list");
      setSaving(false);
      try {
        await createBlogPost(payload);
        load(); // background refresh
      } catch {
        showError("Failed to publish post. Please try again.");
      }
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this post?")) return;
    const snapshot = posts;
    setPosts((prev) => prev.filter((p) => p.id !== id));
    try {
      await deleteBlogPost(id);
    } catch {
      setPosts(snapshot);
      showError("Failed to delete post. Please try again.");
    }
  }

  async function handleToggle(id: number, published: boolean) {
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, published: !published } : p));
    try {
      await toggleBlogPublished(id, !published);
    } catch {
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, published } : p));
      showError("Failed to update status. Please try again.");
    }
  }

  // Blog ordering mixes display_order (admin pin) with created_at (chronology)
  // so the generic hook — which keys on display_order alone — can't express the
  // swap when both neighbours share order = 0. Optimistic update moves by
  // array index; the server picks fresh numbers. We still use the shared hook
  // for its in-flight gate and error toast, but with a synthetic `_index` key.
  const postsWithIndex = posts.map((p, i) => ({ ...p, _index: i }));
  const { reorder, error: reorderError } = useOptimisticReorder(
    postsWithIndex,
    (next) => setPosts(next.map(({ _index: _, ...p }) => p as BlogPost)),
    "_index",
    "id",
  );

  async function handleReorder(p: BlogPost, direction: "up" | "down") {
    const withIdx = postsWithIndex.find(x => x.id === p.id);
    if (!withIdx) return;
    await reorder(withIdx, direction, async () => {
      await reorderBlogPost(p.id, direction);
      // Refresh to pick up the server-assigned display_order numbers.
      await load();
    });
  }

  const isExpired = (p: BlogPost) => !!p.expires_at && new Date(p.expires_at) < new Date();
  const isScheduled = (p: BlogPost) => !!p.starts_at && new Date(p.starts_at) > new Date();

  function handleTitleChange(title: string) {
    setForm((f) => ({
      ...f,
      title,
      slug: editing ? f.slug : toSlug(title),
    }));
  }

  return (
    <AdminViewTransition viewKey={view}>
      {view === "edit" ? (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl h-[calc(100vh-2rem)] flex flex-col">
        <div className="flex items-center gap-3 mb-6 shrink-0">
          <button
            onClick={() => setView("list")}
            className="text-sm text-muted hover:text-black"
          >
            <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back
          </button>
          <h1 className="font-display text-3xl sm:text-4xl text-black">
            {editing ? "Edit Post" : "New Post"}
          </h1>
        </div>

        <div className="space-y-5 flex-1 overflow-y-auto min-h-0">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Post title"
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="w-full border border-line rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Author</label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Tag</label>
              <select
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-black"
              >
                {BLOG_TAGS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-ink">Published</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Excerpt</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              placeholder="Short summary shown in previews"
              rows={2}
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Start Date <span className="font-normal normal-case text-muted">(optional)</span>
              </label>
              <input type="datetime-local" value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                End Date <span className="font-normal normal-case text-muted">(optional)</span>
              </label>
              <input type="datetime-local" value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black" />
            </div>
          </div>
          <div>
            <div className="flex flex-col gap-2 mb-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">
                Body (Markdown)
                {form.body && (
                  <span className="ml-2 normal-case font-normal text-muted">
                    {estimateReadTime(form.body)} min read
                  </span>
                )}
              </label>
              <MarkdownToolbar
                textareaRef={bodyRef}
                onChange={(v) => setForm(f => ({ ...f, body: v }))}
              />
            </div>
            <textarea
              ref={bodyRef}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Write your post in Markdown…"
              rows={12}
              className="w-full border border-line rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-black resize-y min-h-[200px]"
              style={{ maxWidth: '72ch' }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 shrink-0 border-t border-line mt-4">
          <button
            onClick={() => setView("list")}
            className="text-sm px-4 py-2 border border-line rounded hover:border-black transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim() || !form.slug.trim()}
            className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-near-black disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Publish Post"}
          </button>
        </div>
      </div>
      ) : (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-black">Blog</h1>
          <p className="text-sm text-muted mt-0.5">
            {posts.filter((p) => p.published).length} published · {posts.filter((p) => !p.published).length} drafts
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-black text-white text-sm font-semibold px-4 py-2 rounded hover:bg-near-black transition-colors"
        >
          + New Post
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner label="Loading" /></div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {posts.map((p, idx) => (
              <div key={p.id} className="bg-white border border-line rounded-lg p-4">
                <div className="flex items-start gap-3 mb-2">
                  <ReorderButtons
                    onUp={() => handleReorder(p, "up")}
                    onDown={() => handleReorder(p, "down")}
                    disableUp={idx === 0}
                    disableDown={idx === posts.length - 1}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink font-medium text-sm truncate">{p.title}</div>
                    <div className="text-xs text-muted font-mono mt-0.5">/blog/{p.slug}</div>
                  </div>
                  <span className="text-xs bg-blue-light text-blue px-2 py-0.5 rounded shrink-0">{p.tag}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted mb-3 flex-wrap">
                  {p.author && <span>{p.author}</span>}
                  <span>{formatDate(p.created_at)}</span>
                  {p.published && !isExpired(p) && isScheduled(p) && (
                    <span className="bg-blue-light text-blue px-2 py-0.5 rounded border border-line">Scheduled</span>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-line">
                  <button
                    onClick={() => handleToggle(p.id, p.published)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      p.published && !isExpired(p)
                        ? "border-success-border text-success hover:bg-success-light"
                        : "border-line text-muted hover:border-black"
                    }`}
                  >
                    {p.published ? (isExpired(p) ? "Expired" : "Live") : "Draft"}
                  </button>
                  <button onClick={() => openEdit(p)} className="text-xs px-3 py-1.5 rounded border border-line text-blue-mid hover:border-black transition-colors">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-xs px-3 py-1.5 rounded border border-line text-danger hover:border-danger transition-colors ml-auto">Delete</button>
                </div>
              </div>
            ))}
            {posts.length === 0 && (
              <p className="text-muted text-sm text-center py-8">No posts yet.</p>
            )}
          </div>

          {/* Desktop table view */}
          <div className="bg-white border border-line rounded-lg overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-off-white text-xs text-muted uppercase tracking-wide">
                  <th className="text-left px-2 py-3 w-14" />
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Tag</th>
                  <th className="text-left px-4 py-3">Author</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Date</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p, i) => (
                  <tr key={p.id} className={`border-b border-line last:border-0 ${i % 2 === 1 ? "bg-off-white/40" : ""}`}>
                    <td className="px-2 py-3">
                      <ReorderButtons
                        onUp={() => handleReorder(p, "up")}
                        onDown={() => handleReorder(p, "down")}
                        disableUp={i === 0}
                        disableDown={i === posts.length - 1}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink font-medium text-sm truncate max-w-[200px]">{p.title}</div>
                      <div className="text-xs text-muted font-mono">/blog/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-blue-light text-blue px-2 py-0.5 rounded">{p.tag}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.author}</td>
                    <td className="px-4 py-3 text-muted hidden lg:table-cell">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleToggle(p.id, p.published)}
                          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                            p.published && !isExpired(p)
                              ? "border-success-border text-success hover:bg-success-light"
                              : "border-line text-muted hover:border-black"
                          }`}
                        >
                          {p.published ? (isExpired(p) ? "Expired" : "Live") : "Draft"}
                        </button>
                        {p.published && !isExpired(p) && isScheduled(p) && (
                          <span className="text-xs bg-blue-light text-blue px-2 py-0.5 rounded border border-line">Scheduled</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(p)} className="text-xs text-blue-mid hover:underline mr-3">Edit</button>
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-danger hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
                {posts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted text-sm">No posts yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ErrorToast message={reorderError} />
      <ErrorToast message={toastMessage} onDismiss={dismissToast} />
    </div>
      )}
    </AdminViewTransition>
  );
}
