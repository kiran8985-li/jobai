import "server-only";
import { env } from "../env";
import { createSupabaseAdminClient } from "../supabase/admin";
import { runConfiguredScan } from "./index";

export const USER_SCAN_COOLDOWN_MIN = 10;

export type UserScanOutcome =
  | { ok: true; newJobs: number; newMatches: number; applications: number }
  | { ok: false; reason: "cooldown"; minutesLeft: number }
  | { ok: false; reason: "busy" | "not_ready" | "failed" | "not_configured" };

/**
 * "Run scan now" for one signed-in user. Only that user's searches are used for the job queries,
 * and only that user's matches, CVs and applications are processed. At most once every 10 minutes
 * per user, so the button cannot be used to hammer the job sites or the AI.
 */
export async function runUserScan(userId: string, now = Date.now()): Promise<UserScanOutcome> {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "not_configured" };
  const db = createSupabaseAdminClient();

  const [{ data: me }, { count: searches }, { count: masters }] = await Promise.all([
    db.from("profiles_user").select("last_manual_scan_at").eq("id", userId).maybeSingle(),
    db.from("search_profiles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_active", true),
    db.from("cvs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("approved", true),
  ]);
  if (!searches || !masters) return { ok: false, reason: "not_ready" };

  const last = me?.last_manual_scan_at ? Date.parse(me.last_manual_scan_at) : 0;
  const wait = last + USER_SCAN_COOLDOWN_MIN * 60_000 - now;
  if (wait > 0) return { ok: false, reason: "cooldown", minutesLeft: Math.ceil(wait / 60_000) };

  // Claim the slot first so two clicks cannot both start a scan.
  const claim = await db
    .from("profiles_user")
    .update({ last_manual_scan_at: new Date(now).toISOString() })
    .eq("id", userId)
    .or(`last_manual_scan_at.is.null,last_manual_scan_at.lte.${new Date(now - USER_SCAN_COOLDOWN_MIN * 60_000).toISOString()}`)
    .select("id");
  if (!claim.data?.length) return { ok: false, reason: "cooldown", minutesLeft: USER_SCAN_COOLDOWN_MIN };

  try {
    const r = await runConfiguredScan({ userId });
    if (r.status === "already_running") {
      // Give the slot back: nothing ran.
      await db.from("profiles_user").update({ last_manual_scan_at: me?.last_manual_scan_at ?? null }).eq("id", userId);
      return { ok: false, reason: "busy" };
    }
    return { ok: true, newJobs: r.newJobs, newMatches: r.newMatches, applications: r.applications };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
