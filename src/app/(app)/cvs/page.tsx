import Link from "next/link";
import { Alert } from "@/components/auth-ui";
import { DownloadButtons, FlagsPanel } from "@/components/cv-preview";
import { requireUser } from "@/lib/auth";
import { listCvs } from "@/lib/cv/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCv } from "./actions";

export const metadata = { title: "My CVs – JobPilot AI" };

export default async function CvsPage({ searchParams }: { searchParams: Promise<{ approved?: string }> }) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const cvs = await listCvs(supabase, user.id);
  const approved = (await searchParams).approved === "1";
  const { data: tailoredRows } = await supabase
    .from("tailored_cvs")
    .select("job_id, flags, method, updated_at, jobs(title, company)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  const tailored = (tailoredRows ?? []) as unknown as { job_id: string; flags: string[]; method: string; updated_at: string; jobs: { title: string; company: string } | null }[];
  const hasMaster = cvs.some((c) => c.approved);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">My CVs</h1>
        <Link
          href="/onboarding"
          className="flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover"
        >
          Upload a CV
        </Link>
      </div>
      {approved && <Alert kind="notice">Your master CV is approved. JobPilot AI will only ever use facts from it.</Alert>}

      {cvs.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
          <p className="font-semibold">No CVs yet</p>
          <p className="mt-1 text-sm text-muted">Upload your CV to start. You check and approve it before it is used.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {cvs.map((cv) => (
            <li key={cv.id} className="rounded-[18px] border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{cv.filename}</p>
                  <p className="mt-1 text-sm text-muted">
                    Uploaded {new Date(cv.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {cv.flags.length > 0 && ` · ${cv.flags.length} item${cv.flags.length === 1 ? "" : "s"} removed when reading`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    cv.approved
                      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {cv.approved ? "Master CV" : "Needs your approval"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {cv.approved && <DownloadButtons base="/api/cvs/master" />}
                <Link
                  href={`/cvs/${cv.id}/review`}
                  className="flex min-h-11 items-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent"
                >
                  {cv.approved ? "View or edit" : "Review and approve"}
                </Link>
                <form action={deleteCv}>
                  <input type="hidden" name="id" value={cv.id} />
                  <button
                    type="submit"
                    className="flex min-h-11 items-center rounded-[12px] px-4 text-sm font-bold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-xl font-extrabold">CVs tailored for jobs</h2>
      <p className="mt-1 text-sm text-muted">One version per job, so you can always see exactly what was prepared. Each is fact-checked against your master CV.</p>
      {tailored.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-line bg-surface p-6">
          <p className="font-semibold">No tailored CVs yet</p>
          <p className="mt-1 text-sm text-muted">
            {hasMaster ? "One is made for each new match. You can also create one from any job's page." : "Approve a master CV first."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {tailored.map((t) => (
            <li key={t.job_id} className="rounded-[18px] border border-line bg-surface p-5" data-tailored={t.jobs?.title}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-bold">
                    <Link href={`/jobs/${t.job_id}#tailored`} className="hover:text-accent">{t.jobs?.title ?? "Job no longer listed"}</Link>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {t.jobs?.company ? `${t.jobs.company} · ` : ""}
                    {t.method === "ai" ? "Tailored with AI" : "Reordered, no AI"} ·{" "}
                    {new Date(t.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${t.flags.length ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"}`}>
                  {t.flags.length ? `${t.flags.length} removed by fact check` : "Fact check clean"}
                </span>
              </div>
              {t.flags.length > 0 && (
                <details className="mt-3">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent">Show what was removed</summary>
                  <FlagsPanel flags={t.flags} />
                </details>
              )}
              <div className="mt-3">
                <DownloadButtons base={`/api/cvs/tailored/${t.job_id}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
