import "server-only";
import { env } from "./env";
import { createSupabaseAdminClient } from "./supabase/admin";

let synced: string | undefined;

/**
 * The database enforces invites (so the rule holds even if someone skips the app), which means
 * it must know the current SIGNUP_MODE. This copies the setting across, once per server process.
 * If it cannot run, the database stays on its safe default: invite-only.
 */
export async function syncSignupMode(): Promise<void> {
  const e = env();
  if (synced === e.SIGNUP_MODE) return;
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return;
  const { error } = await createSupabaseAdminClient()
    .from("app_settings")
    .upsert({ key: "signup_mode", value: e.SIGNUP_MODE });
  if (error) {
    console.error("Could not sync SIGNUP_MODE to the database:", error.message);
    return;
  }
  synced = e.SIGNUP_MODE;
}
