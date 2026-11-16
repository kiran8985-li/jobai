import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Applications – JobPilot AI" };

type Row = { id: string; status: string; method: string | null; created_at: string; sent_at: string | null; jobs: { id: string; title: string; company: string; location: string } | null };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("applications")
    .select("id, status, method, created_at, sent_at, jobs(id, title, company, location)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as Row[];
  const waiting = rows.filter((r) => r.status === "manual").length;

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Applications</h1>
      <p className="mt-2 text-sm text-muted">
        Every application shows whether it was sent for you or is waiting for you.
        {waiting > 0 && ` ${waiting} ${waiting === 1 ? "is" : "are"} waiting for you now.`}
      </p>
      {rows.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
          <p className="font-semibold">No applications yet</p>
          <p className="mt-1 text-sm text-muted">When a job matches one of your searches, an application is prepared here. Nothing is sent unless you have turned auto-apply on.</p>
          <Link href="/jobs" className="mt-4 inline-flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover">See your jobs</Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[18px] border border-line bg-surface p-5" data-application={r.jobs?.title}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-bold">
                    {r.jobs ? <Link href={`/jobs/${r.jobs.id}#apply`} className="hover:text-accent">{r.jobs.title}</Link> : "Job no longer listed"}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted">
                    {[r.jobs?.company, r.jobs?.location].filter(Boolean).join(" · ")}
                    {" · "}
                    {new Date(r.sent_at ?? r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <StatusChip status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
