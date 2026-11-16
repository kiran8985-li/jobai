import { Table, adminCard, when } from "@/components/admin-blocks";
import { adminDb } from "@/lib/admin/data";
import { getHealth } from "@/lib/admin/health";

export const metadata = { title: "System health – Admin" };

export default async function AdminHealth() {
  const { db } = await adminDb();
  const h = await getHealth(db);
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">System health</h1>
      <section className={`mt-4 ${adminCard}`} data-scheduler={h.scanOverdue ? "overdue" : "ok"}>
        <p className="text-sm text-muted">Last finished scan</p>
        <p className="text-2xl font-extrabold">{when(h.lastScanFinished)}</p>
        <p className={`mt-1 text-sm font-semibold ${h.scanOverdue ? "text-red-700 dark:text-red-300" : "text-green-800 dark:text-green-300"}`}>
          {h.scanOverdue ? "Overdue: scans should finish every 15 minutes." : "On schedule."}
        </p>
      </section>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="c-h">
        <h2 id="c-h" className="text-lg font-bold">Checks</h2>
        <ul className="mt-3 space-y-2">
          {h.checks.map((c) => (
            <li key={c.name} className="flex items-start gap-3 text-sm" data-check={c.name}>
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${c.ok ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                {c.ok ? "OK" : "Check"}
              </span>
              <span><strong>{c.name}:</strong> {c.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="e-h">
        <h2 id="e-h" className="text-lg font-bold">Errors in the last 24 hours ({h.errors.length})</h2>
        <div className="mt-3">
          <Table caption="Errors in the last 24 hours" head={["When", "Where", "What"]} empty="No errors in the last 24 hours."
            rows={h.errors.map((x) => [when(x.when), x.where, x.message])} />
        </div>
      </section>
    </>
  );
}
