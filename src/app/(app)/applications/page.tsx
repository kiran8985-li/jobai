import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Applications – JobPilot AI" };

type Row = { id: string; status: string; method: string | null; created_at: string; sent_at: string | null; jobs: { id: string; title: string; company: string; location: string } | null };

const FILTERS = [
  { value: "", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "manual", label: "Waiting for you" },
  { value: "dry_run", label: "Prepared" },
  { value: "skipped", label: "Skipped" },
  { value: "failed", label: "Failed" },
];

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.value === sp.status) ? sp.status! : "";
  const q = (sp.q ?? "").trim().slice(0, 60).toLowerCase();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("applications")
    .select("id, status, method, created_at, sent_at, jobs(id, title, company, location)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);
  const all = (data ?? []) as unknown as Row[];
  // "Prepared" covers both test-mode and interrupted sends.
  const statusOf = (r: Row) => (r.status === "prepared" ? "dry_run" : r.status);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, f.value ? all.filter((r) => statusOf(r) === f.value).length : all.length]));
  const rows = all
    .filter((r) => !status || statusOf(r) === status)
    .filter((r) => !q || `${r.jobs?.title ?? ""} ${r.jobs?.company ?? ""}`.toLowerCase().includes(q));

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Applications</h1>
      <p className="mt-2 text-sm text-muted">Every application shows whether it was sent for you or is waiting for you.</p>

      {all.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
          <p className="font-semibold">No applications yet</p>
          <p className="mt-1 text-sm text-muted">When a job matches one of your searches, an application is prepared here. Nothing is sent unless you have turned auto-apply on.</p>
          <Link href="/jobs" className="mt-4 inline-flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover">See your jobs</Link>
        </div>
      ) : (
        <>
          <nav aria-label="Filter by status" className="mt-6 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {FILTERS.map((f) => {
              const on = f.value === status;
              const href = `/applications?${new URLSearchParams({ ...(f.value ? { status: f.value } : {}), ...(q ? { q } : {}) })}`;
              return (
                <Link key={f.value} href={href} aria-current={on ? "page" : undefined}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold ${on ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent"}`}>
                  {f.label}
                  <span className={`rounded-full px-2 text-xs ${on ? "bg-white/20" : "bg-accent-tint text-accent"}`}>{counts[f.value]}</span>
                </Link>
              );
            })}
          </nav>
          <form method="get" className="mt-3 flex gap-2">
            {status && <input type="hidden" name="status" value={status} />}
            <label className="sr-only" htmlFor="q">Search by job or company</label>
            <input id="q" name="q" defaultValue={sp.q ?? ""} maxLength={60} placeholder="Search by job or company"
              className="min-h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-base outline-none focus:border-accent" />
            <button type="submit" className="min-h-11 shrink-0 rounded-[12px] border border-line px-4 font-bold hover:border-accent">Search</button>
          </form>

          {rows.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-line bg-surface p-6">
              <p className="font-semibold">Nothing here</p>
              <p className="mt-1 text-sm text-muted">No applications match this filter. <Link href="/applications" className="font-semibold text-accent">Show all</Link></p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {rows.map((r) => (
                <li key={r.id} data-application={r.jobs?.title}>
                  <Link href={`/applications/${r.id}`} className="block rounded-[18px] border border-line bg-surface p-5 hover:border-accent">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-bold">{r.jobs?.title ?? "Job no longer listed"}</p>
                        <p className="mt-1 break-words text-sm text-muted">
                          {[r.jobs?.company, r.jobs?.location].filter(Boolean).join(" · ")}
                          {" · "}
                          {new Date(r.sent_at ?? r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <StatusChip status={r.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
