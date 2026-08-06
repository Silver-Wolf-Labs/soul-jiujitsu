"use client";

import { useRef, useState } from "react";
import { uploadAsset } from "@/lib/actions/assets";

interface Props {
  onUploaded?: (url: string, id: number) => void;
  onReload?: () => void;
}

export default function AssetUploader({ onUploaded, onReload }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    setProgress(`Uploading ${file.name}…`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url, id } = await uploadAsset(fd);
      setProgress(null);
      onUploaded?.(url, id);
      onReload?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-black bg-off-white" : "border-line hover:border-black"
        }`}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onInputChange} className="hidden" />
        {uploading ? (
          <p className="text-sm text-muted">{progress}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">Drag & drop or click to upload</p>
            <p className="text-xs text-muted mt-1">JPG, PNG, WebP, GIF — max 5MB</p>
          </>
        )}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
