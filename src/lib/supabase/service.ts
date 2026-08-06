import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client using the service role key.
 * Bypasses RLS — use only in trusted server-side contexts (Server Actions, Route Handlers).
 * Never import this in client components or expose it to the browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
