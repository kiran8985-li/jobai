import "server-only";
import { env } from "../env";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createResendSender } from "./resend";
import { runApply, type ApplyResult } from "./run";
import { supabaseApplyStore } from "./supabase-store";

/**
 * The apply stage as the app runs it. APPLY_MODE decides whether anything can be sent:
 * "dry_run" (the default) prepares and stores everything and sends nothing.
 */
export async function runConfiguredApply(opts: { userId?: string } = {}): Promise<ApplyResult | null> {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return null;
  return runApply({
    store: supabaseApplyStore(createSupabaseAdminClient()),
    mode: e.APPLY_MODE,
    mailFrom: e.MAIL_FROM,
    sender: createResendSender(e.RESEND_API_KEY),
    userId: opts.userId,
  });
}
