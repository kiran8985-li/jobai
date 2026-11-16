import { Table, adminButton, adminCard, when } from "@/components/admin-blocks";
import { inputClass } from "@/components/auth-ui";
import { StatusChip } from "@/components/status-chip";
import { STATUS_LABEL, adminDb, listUsers } from "@/lib/admin/data";
import { sourceLabel } from "@/lib/match/display";

export const metadata = { title: "Application log – Admin" };

type Row = { status: string; method: string | null; created_at: string; sent_at: string | null; user_id: string; detail: { skip_reason?: string; error?: string } | null; jobs: { title: string; company: string; source: string } | null };

export default async function AdminApplications({ searchParams }: { searchParams: Promise<{ status?: string; user?: string; days?: string }> }) {
  const { db } = await adminDb();
  const sp = await searchParams;
  const status = sp.status && sp.status in STATUS_LABEL ? sp.status : "";
  const days = ["1", "7", "30", "365"].includes(sp.days ?? "") ? Number(sp.days) : 30;
  const users = await listUsers(db);
  const userId = users.some((u) => u.id === sp.user) ? sp.user! : "";
  let q = db
    .from("applications")
    .select("status, method, created_at, sent_at, user_id, detail, jobs(title, company, source)")
    .gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) q = q.eq("status", status);
  if (userId) q = q.eq("user_id", userId);
  const rows = ((await q).data ?? []) as unknown as Row[];
  const emailOf = new Map(users.map((u) => [u.id, u.email]));

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Application log</h1>
      <form method="get" className={`mt-4 grid gap-3 sm:grid-cols-4 sm:items-end ${adminCard}`}>
        <label className="block text-sm font-semibold">
          Status
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          User
          <select name="user" defaultValue={userId} className={inputClass}>
            <option value="">Everyone</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Period
          <select name="days" defaultValue={String(days)} className={inputClass}>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="365">Last year</option>
          </select>
        </label>
        <button type="submit" className={adminButton}>Filter</button>
      </form>
      <p className="mt-4 text-sm text-muted" role="status">{rows.length === 300 ? "Showing the latest 300." : `${rows.length} application${rows.length === 1 ? "" : "s"}.`}</p>
      <div className="mt-2">
        <Table
          caption="Applications"
          head={["When", "User", "Job", "Source", "Status", "Note"]}
          empty="No applications match these filters."
          rows={rows.map((r) => [
            when(r.sent_at ?? r.created_at),
            <span key="u" className="break-all">{emailOf.get(r.user_id) ?? "Deleted user"}</span>,
            r.jobs ? `${r.jobs.title}${r.jobs.company ? `, ${r.jobs.company}` : ""}` : "Job removed",
            r.jobs ? sourceLabel(r.jobs.source) : "",
            <StatusChip key="s" status={r.status} />,
            r.detail?.skip_reason ?? r.detail?.error ?? "",
          ])}
        />
      </div>
    </>
  );
}
