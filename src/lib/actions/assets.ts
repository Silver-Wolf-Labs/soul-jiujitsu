"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { logAuditEvent } from "@/lib/audit";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function uploadAsset(formData: FormData): Promise<{ url: string; id: number }> {
  await requireAdmin();
  const supabase = createClient();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("File type not allowed. Use JPG, PNG, WebP, or GIF.");
  if (file.size > MAX_BYTES) throw new Error("File too large. Maximum size is 5MB.");

  const ext = file.name.split(".").pop() ?? "jpg";
  const storagePath = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage.from("assets").getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  const { data: row, error: dbError } = await supabase
    .from("assets")
    .insert({
      filename: file.name,
      storage_path: storagePath,
      public_url: publicUrl,
      alt_text: "",
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (dbError) throw new Error(dbError.message);

  await logAuditEvent("CREATE", "assets", String(row.id), { filename: file.name, size_bytes: file.size });
  return { url: publicUrl, id: row.id };
}

export async function updateAssetAltText(id: number, alt_text: string) {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase.from("assets").update({ alt_text }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent("UPDATE", "assets", String(id), { alt_text });
}

export async function deleteAsset(id: number) {
  await requireAdmin();
  const supabase = createClient();
  const { data: asset } = await supabase.from("assets").select("*").eq("id", id).single();
  if (!asset) throw new Error("Asset not found");

  // Delete from storage
  await supabase.storage.from("assets").remove([asset.storage_path]);

  // Delete from DB
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logAuditEvent("DELETE", "assets", String(id), { deleted: asset });
}
