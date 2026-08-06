"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteAsset, updateAssetAltText } from "@/lib/actions/assets";
import AssetUploader from "./AssetUploader";
import type { Asset } from "@/lib/supabase/types";
import Spinner from "@/components/ui/Spinner";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface Props {
  /** Called when user clicks an asset to select it */
  onSelect?: (url: string) => void;
  /** If true, show a "Select" button per asset; default false (browse-only) */
  selectable?: boolean;
}

export default function AssetBrowser({ onSelect, selectable = false }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAlt, setEditingAlt] = useState<number | null>(null);
  const [altText, setAltText] = useState("");

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("assets").select("*").order("created_at", { ascending: false });
    setAssets((data as Asset[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: number) {
    if (!confirm("Delete this asset? This cannot be undone.")) return;
    await deleteAsset(id);
    await load();
  }

  async function handleSaveAlt(id: number) {
    await updateAssetAltText(id, altText);
    setEditingAlt(null);
    await load();
  }

  return (
    <div>
      <div className="mb-6">
        <AssetUploader onReload={load} onUploaded={selectable ? (url) => onSelect?.(url) : undefined} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-10"><Spinner size="sm" /></div>
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted h-10 flex items-center">No assets uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {assets.map((asset) => (
            <div key={asset.id} className="border border-line rounded-lg overflow-hidden bg-white group">
              {/* Image preview */}
              <div className="aspect-square bg-off-white flex items-center justify-center overflow-hidden relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.public_url}
                  alt={asset.alt_text || asset.filename}
                  className="w-full h-full object-cover"
                />
                {selectable && (
                  <button
                    onClick={() => onSelect?.(asset.public_url)}
                    className="absolute inset-0 bg-black/50 text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    Select
                  </button>
                )}
              </div>

              {/* Info */}
              <div className="p-2">
                <p className="text-xs text-ink font-medium truncate" title={asset.filename}>{asset.filename}</p>
                <p className="text-xs text-muted">{formatBytes(asset.size_bytes)}</p>

                {/* Alt text */}
                {editingAlt === asset.id ? (
                  <div className="mt-1.5">
                    <input
                      type="text"
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                      placeholder="Alt text…"
                      className="w-full border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-black"
                    />
                    <div className="flex gap-1 mt-1">
                      <button onClick={() => handleSaveAlt(asset.id)} className="text-xs text-success hover:underline">Save</button>
                      <button onClick={() => setEditingAlt(null)} className="text-xs text-muted hover:underline">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="text-xs text-muted truncate cursor-pointer hover:text-ink mt-0.5"
                    title={asset.alt_text || "Add alt text"}
                    onClick={() => { setEditingAlt(asset.id); setAltText(asset.alt_text); }}
                  >
                    {asset.alt_text || <span className="italic">Add alt text</span>}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-1.5">
                  <a href={asset.public_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-mid hover:underline">Open</a>
                  <button onClick={() => handleDelete(asset.id)} className="text-xs text-danger hover:underline">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
