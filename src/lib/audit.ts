"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "TOGGLE";

export type AuditMetadata = {
  ip_address?: string | null;
  user_agent?: string | null;
  [key: string]: unknown;
};

/**
 * Write a lean audit log entry.
 * Call after every successful admin mutation.
 * Failures are swallowed — a logging error should never break the main action.
 *
 * @param action   What happened: CREATE | UPDATE | DELETE | TOGGLE
 * @param table    DB table name (e.g. "banners", "blog_posts")
 * @param recordId The PK of the affected row (stringified)
 * @param payload  Lean diff — only the changed/relevant fields, not the full row
 * @param metadata Optional request context (ip_address, user_agent, etc.).
 *                 When omitted, auto-populated from request headers.
 */
export async function logAuditEvent(
  action: AuditAction,
  table: string,
  recordId: string | number | null,
  payload: Record<string, unknown> = {},
  metadata?: AuditMetadata
): Promise<void> {
  try {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    // Auto-populate metadata from request headers when not explicitly provided
    let resolvedMetadata: AuditMetadata;
    if (metadata) {
      resolvedMetadata = metadata;
    } else {
      const hdrs = await headers();
      resolvedMetadata = {
        ip_address: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        user_agent: hdrs.get("user-agent") ?? null,
      };
    }

    await supabase.from("audit_logs").insert({
      user_id:    user?.id    ?? null,
      user_email: user?.email ?? null,
      action,
      table_name: table,
      record_id:  recordId != null ? String(recordId) : null,
      payload,
      metadata:   resolvedMetadata,
    });
  } catch (err) {
    // Never let audit logging break the main action
    console.error("[audit] failed to write audit log:", err);
  }
}
