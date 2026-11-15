import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/**
 * Service-role client. BYPASSES Row Level Security: use only in trusted server code
 * (the scan, admin pages after an is_admin check, cron routes). Never import from client code.
 */
export function createSupabaseAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = env();
  if (!url || !key) {
    throw new Error("Supabase admin is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
