import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../auth";
import { env } from "../env";
import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * The only way admin pages and actions get database access: is_admin is checked on the server
 * first, then the service-role client (which can read every user's rows) is returned.
 */
export async function adminDb(): Promise<{ db: SupabaseClient; adminId: string }> {
  const me = await requireAdmin();
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Database is not configured");
  return { db: createSupabaseAdminClient(), adminId: me.id };
}

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  is_active: boolean;
  verified: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

/** Every account, joined with its sign-in email (which lives in Supabase Auth, not in our tables). */
export async function listUsers(db: SupabaseClient): Promise<UserRow[]> {
  const auth = new Map<string, { email: string; verified: boolean; last: string | null; created: string }>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const u of data.users) auth.set(u.id, { email: u.email ?? "", verified: Boolean(u.email_confirmed_at), last: u.last_sign_in_at ?? null, created: u.created_at });
    if (data.users.length < 200) break;
  }
  const { data: profiles } = await db.from("profiles_user").select("id, name, is_admin, is_active, created_at").order("created_at");
  return (profiles ?? []).map((p) => {
    const a = auth.get(p.id as string);
    return {
      id: p.id as string,
      email: a?.email ?? "",
      name: (p.name as string | null) ?? null,
      is_admin: p.is_admin === true,
      is_active: p.is_active === true,
      verified: a?.verified ?? false,
      created_at: (a?.created ?? p.created_at) as string,
      last_sign_in_at: a?.last ?? null,
    };
  });
}

/** Estimated cost in US dollars, from token counts and the prices in the settings. */
export function costUsd(promptTokens: number, completionTokens: number): number {
  const e = env();
  return (promptTokens / 1e6) * e.AI_PRICE_INPUT_PER_MTOK + (completionTokens / 1e6) * e.AI_PRICE_OUTPUT_PER_MTOK;
}
export const usd = (n: number) => (n > 0 && n < 0.01 ? "under $0.01" : `$${n.toFixed(2)}`);

export const STATUS_LABEL: Record<string, string> = {
  sent: "Sent",
  manual: "Waiting for user",
  dry_run: "Prepared (test mode)",
  prepared: "Prepared",
  skipped: "Skipped",
  failed: "Failed",
};

/** Midnight UK time today, as an ISO instant. */
export { ukDayStart } from "../apply/run";
