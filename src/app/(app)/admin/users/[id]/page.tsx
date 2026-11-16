import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Stat, Table, adminCard, adminDanger, adminPrimary, when } from "@/components/admin-blocks";
import { Alert } from "@/components/auth-ui";
import { StatusChip } from "@/components/status-chip";
import { adminDb, costUsd, listUsers, ukDayStart, usd } from "@/lib/admin/data";
import { env } from "@/lib/env";
import { setUserActive } from "../../actions";

export const metadata = { title: "User activity – Admin" };

const MSG: Record<string, { kind: "notice" | "error"; text: string }> = {
  suspended: { kind: "notice", text: "Suspended. They have been signed out and cannot use JobPilot AI until restored." },
  restored: { kind: "notice", text: "Restored. They can sign in again." },
  self: { kind: "error", text: "You cannot suspend your own account." },
  admin: { kind: "error", text: "Admin accounts cannot be suspended here." },
};

/**
 * One user's activity. Shows counts, statuses and job titles only: never CV contents, screening
 * answers or emails, which the admin does not need to see.
 */
export default async function AdminUser({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { db, adminId } = await adminDb();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const user = (await listUsers(db)).find((u) => u.id === id.data);
  if (!user) notFound();
  const msg = MSG[(await searchParams).msg ?? ""];
  const today = ukDayStart(Date.now());

  const [cvs, searches, apps, ai] = await Promise.all([
    db.from("cvs").select("approved, created_at").eq("user_id", user.id),
    db.from("search_profiles").select("name, is_active, auto_apply, consent_at, daily_limit, min_match").eq("user_id", user.id),
    db.from("applications").select("status, created_at, jobs(title, company)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(25),
    db.from("ai_usage").select("purpose, prompt_tokens, completion_tokens, ok, created_at").eq("user_id", user.id).gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(5000),
  ]);
  const aiRows = ai.data ?? [];
  const aiToday = aiRows.filter((r) => r.created_at >= today).length;
  const cost30 = aiRows.reduce((t, r) => t + costUsd(r.prompt_tokens, r.completion_tokens), 0);

  return (
    <>
      <Link href="/admin/users" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">Back to users</Link>
      <h1 className="break-words text-3xl font-extrabold tracking-tight">{user.name ?? "No name"}</h1>
      <p className="break-all text-muted">{user.email}</p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <section className={`mt-4 ${adminCard}`}>
        <p className="text-sm">
          <strong>{!user.is_active ? "Suspended" : !user.verified ? "Email not verified" : "Active"}</strong>
          {user.is_admin && " · admin"} · joined {when(user.created_at)} · last sign-in {when(user.last_sign_in_at)}
        </p>
        {user.id !== adminId && !user.is_admin && (
          <form action={setUserActive} className="mt-3">
            <input type="hidden" name="id" value={user.id} />
            <input type="hidden" name="active" value={String(!user.is_active)} />
            <button type="submit" className={user.is_active ? adminDanger : adminPrimary}>
              {user.is_active ? "Suspend this account" : "Restore this account"}
            </button>
          </form>
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="CVs" value={(cvs.data ?? []).length} hint={(cvs.data ?? []).some((c) => c.approved) ? "master approved" : "no master yet"} />
        <Stat label="Searches" value={(searches.data ?? []).length} hint={`${(searches.data ?? []).filter((s) => s.auto_apply && s.consent_at).length} with auto-apply`} />
        <Stat label="AI calls today" value={`${aiToday} / ${env().AI_DAILY_LIMIT_PER_USER}`} hint="daily limit" />
        <Stat label="AI cost, 30 days" value={usd(cost30)} hint="estimate" />
      </div>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="s-h">
        <h2 id="s-h" className="text-lg font-bold">Searches</h2>
        <div className="mt-3">
          <Table caption="Searches" head={["Name", "Searching", "Auto-apply", "Minimum", "Daily limit"]} empty="No searches yet."
            rows={(searches.data ?? []).map((s) => [s.name, s.is_active ? "Yes" : "Paused", s.auto_apply && s.consent_at ? "On" : "Off", s.min_match, s.daily_limit])} />
        </div>
      </section>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="a-h">
        <h2 id="a-h" className="text-lg font-bold">Recent applications</h2>
        <div className="mt-3">
          <Table caption="Recent applications" head={["Job", "Status", "When"]} empty="No applications yet."
            rows={((apps.data ?? []) as unknown as { status: string; created_at: string; jobs: { title: string; company: string } | null }[]).map((a) => [
              a.jobs ? `${a.jobs.title}${a.jobs.company ? `, ${a.jobs.company}` : ""}` : "Job removed",
              <StatusChip key="s" status={a.status} />,
              when(a.created_at),
            ])} />
        </div>
      </section>
    </>
  );
}
