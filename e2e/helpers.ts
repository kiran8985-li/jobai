import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export const DB_URL = process.env.E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
export const PASSWORD = "correct-horse-battery-1";

/** Refuses to run against anything but a local Supabase: these tests delete every user. */
export function assertLocal() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error(`Refusing to run end-to-end tests against ${url || "an unset Supabase URL"}`);
}

export const sql = (q: string) => execSync(`psql "${DB_URL}" -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim();

export const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function resetDatabase() {
  const a = adminClient();
  await a.storage.emptyBucket("cvs");
  await a.storage.emptyBucket("tailored");
  sql("truncate auth.users cascade; delete from public.invites; delete from public.invite_requests; truncate public.jobs cascade; truncate public.scan_runs; truncate public.source_status; delete from public.ai_usage; update public.app_settings set value='invite'");
}

/** Creates a verified account directly (for people the test does not sign up through the UI). */
export async function makeUser(email: string, name: string): Promise<string> {
  const a = adminClient();
  const { data: inv } = await a.from("invites").insert({ email }).select("token").single();
  const { data, error } = await a.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { invite_token: inv!.token, name } });
  if (error) throw error;
  return data.user.id;
}

/** The verification link from the newest email to `to` in the local mail catcher. */
export async function verificationLink(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const r = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json()) as { messages?: { ID: string }[] };
    if (r.messages?.length) {
      const m = (await (await fetch(`${MAILPIT}/api/v1/message/${r.messages[0].ID}`)).json()) as { HTML?: string; Text?: string };
      const link = (m.HTML || m.Text || "").match(/https?:\/\/[^\s"'<]+verify[^\s"'<]+/);
      if (link) return link[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No verification email for ${to}`);
}
