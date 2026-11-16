import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_SENDING_ENABLED, effectiveApplyMode } from "../apply";
import { env, hasAI } from "../env";

export type Health = {
  lastScanFinished: string | null;
  scanOverdue: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  errors: { when: string; where: string; message: string }[];
};

/**
 * What the admin needs to know is working: when the scheduler last finished a scan, which parts
 * are configured, and every error recorded in the last 24 hours (never including CV contents).
 */
export async function getHealth(db: SupabaseClient, now = Date.now()): Promise<Health> {
  const e = env();
  const day = new Date(now - 86_400_000).toISOString();
  const [last, scanErr, sources, aiFail, appFail] = await Promise.all([
    db.from("scan_runs").select("finished_at").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1),
    db.from("scan_runs").select("started_at, error").not("error", "is", null).gte("started_at", day).order("started_at", { ascending: false }).limit(50),
    db.from("source_status").select("name, enabled, last_run, last_error"),
    db.from("ai_usage").select("created_at, purpose").eq("ok", false).gte("created_at", day).order("created_at", { ascending: false }).limit(50),
    db.from("applications").select("updated_at, detail").eq("status", "failed").gte("updated_at", day).limit(50),
  ]);
  const lastScanFinished = (last.data?.[0]?.finished_at as string | undefined) ?? null;
  // The schedule is every 15 minutes; more than 30 minutes without a finished scan means something is wrong.
  const scanOverdue = !lastScanFinished || now - Date.parse(lastScanFinished) > 30 * 60_000;

  const errors: Health["errors"] = [
    ...(scanErr.data ?? []).map((s) => ({ when: s.started_at as string, where: "Scan", message: s.error as string })),
    ...(sources.data ?? []).filter((s) => s.last_error && s.enabled && (s.last_run ?? "") >= day).map((s) => ({ when: s.last_run as string, where: `Source: ${s.name}`, message: s.last_error as string })),
    ...(aiFail.data ?? []).map((a) => ({ when: a.created_at as string, where: "AI", message: `A ${a.purpose} call failed; the non-AI fallback was used.` })),
    ...(appFail.data ?? []).map((a) => ({ when: a.updated_at as string, where: "Applying", message: ((a.detail as { error?: string } | null)?.error ?? "Sending failed") })),
  ].sort((a, b) => b.when.localeCompare(a.when));

  const checks = [
    { name: "Scheduler", ok: !scanOverdue, detail: scanOverdue ? "No finished scan in the last 30 minutes. Check the GitHub Actions workflow and its APP_URL and CRON_SECRET secrets." : "Scans are finishing on schedule." },
    { name: "Scheduler secret", ok: Boolean(e.CRON_SECRET && e.CRON_SECRET.length >= 16), detail: e.CRON_SECRET ? "CRON_SECRET is set." : "CRON_SECRET is not set, so the scan route refuses every call." },
    { name: "AI", ok: hasAI(e), detail: hasAI(e) ? `Configured (model ${e.DEEPSEEK_MODEL}).` : "Not configured: the app uses its non-AI fallbacks." },
    { name: "Email sending", ok: true, detail: EMAIL_SENDING_ENABLED ? `Switched on in code; mode is ${effectiveApplyMode(e.APPLY_MODE)}.` : "Switched off in code for now: applications are prepared, never sent." },
    { name: "Demo jobs", ok: !e.DEMO_SOURCE, detail: e.DEMO_SOURCE ? "DEMO_SOURCE is on. Turn it off before real testers join." : "Off." },
    { name: "Sign-up", ok: true, detail: e.SIGNUP_MODE === "invite" ? "Invite-only." : "Open to everyone." },
  ];
  return { lastScanFinished, scanOverdue, checks, errors };
}
