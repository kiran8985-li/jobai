import { Stat, Table, adminCard, when } from "@/components/admin-blocks";
import { STATUS_LABEL, adminDb } from "@/lib/admin/data";

export const metadata = { title: "Admin – JobPilot AI" };

export default async function AdminOverview() {
  const { db } = await adminDb();
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const [users, active, jobs, jobsDay, apps, scans] = await Promise.all([
    db.from("profiles_user").select("id", { count: "exact", head: true }),
    db.from("profiles_user").select("id", { count: "exact", head: true }).eq("is_active", true),
    db.from("jobs").select("id", { count: "exact", head: true }),
    db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", day),
    db.from("applications").select("status").limit(10000),
    db.from("scan_runs").select("id, started_at, finished_at, new_jobs, new_matches, applications, error").order("started_at", { ascending: false }).limit(10),
  ]);
  const byStatus = new Map<string, number>();
  for (const a of apps.data ?? []) byStatus.set(a.status as string, (byStatus.get(a.status as string) ?? 0) + 1);

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Overview</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users" value={users.count ?? 0} hint={`${active.count ?? 0} active`} />
        <Stat label="Jobs stored" value={jobs.count ?? 0} hint={`${jobsDay.count ?? 0} new in 24 hours`} />
        <Stat label="Applications" value={(apps.data ?? []).length} />
        <Stat label="Scans recorded" value={scans.data?.length ? `${scans.data.length}+` : 0} hint="last 10 below" />
      </div>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="st-h">
        <h2 id="st-h" className="text-lg font-bold">Applications by status</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-admin-status>
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <li key={k} className="flex items-center justify-between rounded-[12px] border border-line px-3 py-2 text-sm">
              <span>{label}</span>
              <span className="font-extrabold tabular-nums" data-status={k}>{byStatus.get(k) ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="sc-h">
        <h2 id="sc-h" className="text-lg font-bold">Last 10 scans</h2>
        <div className="mt-3">
          <Table
            caption="Last 10 scans"
            head={["Started", "Took", "New jobs", "New matches", "Applications", "Problem"]}
            empty="No scans have run yet."
            rows={(scans.data ?? []).map((s) => [
              when(s.started_at),
              s.finished_at ? `${Math.max(1, Math.round((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 1000))} s` : "Running or stopped",
              s.new_jobs,
              s.new_matches,
              s.applications,
              s.error ? <span className="text-red-700 dark:text-red-300">{s.error}</span> : "None",
            ])}
          />
        </div>
      </section>
    </>
  );
}
