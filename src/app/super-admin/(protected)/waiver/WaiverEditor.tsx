"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import { saveWaiverTemplate, customizeWaiverFromProfile } from "./actions";
import StatusBanner from "../StatusBanner";

interface Props {
  templateId: number;
  initialTitle: string;
  initialBody: string;
  hasPlaceholders: boolean;
}

export default function WaiverEditor({ templateId, initialTitle, initialBody, hasPlaceholders }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  function handleSave() {
    setStatus(null);
    startTransition(async () => {
      const result = await saveWaiverTemplate(templateId, title, body);
      if (result.success) {
        setStatus({ type: "success", message: "Waiver saved successfully." });
      } else {
        setStatus({ type: "error", message: result.error });
      }
    });
  }

  function handleAutoFill() {
    setStatus(null);
    startTransition(async () => {
      const result = await customizeWaiverFromProfile();
      if (result.success) {
        if (result.title) setTitle(result.title);
        if (result.bodyMd) setBody(result.bodyMd);
        setStatus({ type: "success", message: "Placeholders replaced with gym details." });
      } else {
        setStatus({ type: "error", message: result.error });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Auto-fill button */}
      {hasPlaceholders && (
        <div className="flex items-center gap-4 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-3">
          <div className="flex-1">
            <p className="text-sm text-blue-300">
              This waiver has <code className="text-xs bg-white/10 px-1 rounded">[GYM NAME]</code>,{" "}
              <code className="text-xs bg-white/10 px-1 rounded">[GYM ADDRESS]</code>, or{" "}
              <code className="text-xs bg-white/10 px-1 rounded">[GYM EMAIL]</code> placeholders.
            </p>
            <p className="text-xs text-blue-300/60 mt-1">
              Click to auto-fill from the current gym identity settings.
            </p>
          </div>
          <button
            onClick={handleAutoFill}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 text-sm font-semibold
                       hover:bg-blue-500/30 transition-colors disabled:opacity-50 shrink-0"
          >
            {isPending ? "Applying..." : "Auto-fill from Gym Setup"}
          </button>
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
          Waiver Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
                     focus:outline-none focus:border-yellow/40 focus:ring-1 focus:ring-yellow/20 transition-colors"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        <button
          onClick={() => setTab("edit")}
          className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
            tab === "edit"
              ? "text-yellow border-yellow"
              : "text-white/40 border-transparent hover:text-white/60"
          }`}
        >
          Edit (Markdown)
        </button>
        <button
          onClick={() => setTab("preview")}
          className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
            tab === "preview"
              ? "text-yellow border-yellow"
              : "text-white/40 border-transparent hover:text-white/60"
          }`}
        >
          Preview
        </button>
      </div>

      {/* Editor / Preview */}
      {tab === "edit" ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={24}
          className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white
                     font-mono leading-relaxed placeholder:text-white/20 focus:outline-none
                     focus:border-yellow/40 focus:ring-1 focus:ring-yellow/20 transition-colors resize-y"
          placeholder="Waiver body in Markdown format..."
        />
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-6 py-5 prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{body}</ReactMarkdown>
        </div>
      )}

      {/* Status */}
      <StatusBanner status={status} />

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-6 py-2.5 rounded-lg bg-yellow text-black font-semibold text-sm
                     hover:bg-yellow-light transition-colors disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Waiver"}
        </button>
        <span className="text-xs text-white/30">
          Markdown format &middot; New signatures will use this version
        </span>
      </div>
    </div>
  );
}
