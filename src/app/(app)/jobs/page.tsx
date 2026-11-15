import Link from "next/link";
import { inputClass } from "@/components/auth-ui";
import { requireUser } from "@/lib/auth";
import { getMasterCv } from "@/lib/cv/store";
import { applyLabel, formatSalary, postedLabel, scoreChip, sourceLabel } from "@/lib/match/display";
import { oneLineReason, type Breakdown } from "@/lib/match/score";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Jobs – JobPilot AI" };

type JobCard = { id: string; title: string; company: string; location: string; salary_min: number | null; salary_max: number | null; source: string; posted_at: string | null; apply_method: string; also_on: string[] };
type Row = { score: number; matching_skills: string[]; missing_skills: string[]; breakdown: Breakdown; search_profile_id: string; jobs: JobCard };

const SCORE_OPTIONS = [
  { value: "matches", label: "My matches (at or above my minimum)" },
  { value: "90", label: "90 or more" },
  { value: "75", label: "75 or more" },
  { value: "60", label: "60 or more" },
  { value: "40", label: "40 or more" },
  { value: "0", label: "Every scored job" },
];
const PAGE = 30;
const card = "mt-6 rounded-[18px] border border-line bg-surface p-6";
const cta = "mt-4 inline-flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [master, { data: profiles }, { data }] = await Promise.all([
    getMasterCv(supabase, user.id),
    supabase.from("search_profiles").select("id, name, min_match").eq("user_id", user.id),
    supabase
      .from("matches")
      .select("score, matching_skills, missing_skills, breakdown, search_profile_id, jobs!inner(id, title, company, location, salary_min, salary_max, source, posted_at, apply_method, also_on)")
      .eq("user_id", user.id)
      .is("filtered_reason", null)
      .order("score", { ascending: false })
      .limit(1000),
  ]);
  const minMatch = new Map((profiles ?? []).map((p) => [p.id as string, p.min_match as number]));

  // A job matched by two searches is shown once, with its best score.
  const best = new Map<string, Row & { isMatch: boolean }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const isMatch = r.score >= (minMatch.get(r.search_profile_id) ?? 75);
    const seen = best.get(r.jobs.id);
    if (!seen) best.set(r.jobs.id, { ...r, isMatch });
    else if (isMatch) seen.isMatch = true;
  }
  const all = [...best.values()];
  const sources = [...new Set(all.map((r) => r.jobs.source))].sort();

  const scoreFilter = SCORE_OPTIONS.some((o) => o.value === sp.score) ? sp.score! : "matches";
  const where = (sp.location ?? "").trim().slice(0, 60).toLowerCase();
  const source = sources.includes(sp.source ?? "") ? sp.source! : "";
  const sort = sp.sort === "date" ? "date" : "score";
  const shown = Math.min(Math.max(Number(sp.n) || PAGE, PAGE), 1000);

  const rows = all
    .filter((r) => (scoreFilter === "matches" ? r.isMatch : r.score >= Number(scoreFilter)))
    .filter((r) => !where || r.jobs.location.toLowerCase().includes(where))
    .filter((r) => !source || r.jobs.source === source)
    .sort((a, b) => (sort === "date" ? (b.jobs.posted_at ?? "").localeCompare(a.jobs.posted_at ?? "") || b.score - a.score : b.score - a.score || (b.jobs.posted_at ?? "").localeCompare(a.jobs.posted_at ?? "")));
  const page = rows.slice(0, shown);
  const more = new URLSearchParams({ score: scoreFilter, location: sp.location ?? "", source, sort, n: String(shown + PAGE) });

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Jobs</h1>

      {!master ? (
        <div className={card}>
          <p className="font-semibold">Approve your CV first</p>
          <p className="mt-1 text-sm text-muted">Jobs are scored against your approved master CV.</p>
          <Link href="/cvs" className={cta}>Go to My CVs</Link>
        </div>
      ) : !profiles?.length ? (
        <div className={card}>
          <p className="font-semibold">Add a job search</p>
          <p className="mt-1 text-sm text-muted">Tell us which job titles and locations you want, and matches will appear here.</p>
          <Link href="/profiles/new" className={cta}>Add a search</Link>
        </div>
      ) : all.length === 0 ? (
        <div className={card}>
          <p className="font-semibold">No jobs scored yet</p>
          <p className="mt-1 text-sm text-muted">New jobs are checked every 15 minutes. Matches will appear here after the next check.</p>
        </div>
      ) : (
        <>
          <form method="get" className="mt-6 grid gap-4 rounded-[18px] border border-line bg-surface p-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Score
              <select name="score" defaultValue={scoreFilter} className={inputClass}>
                {SCORE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Location contains
              <input name="location" defaultValue={sp.location ?? ""} maxLength={60} placeholder="For example: Manchester" className={inputClass} />
            </label>
            <label className="block text-sm font-semibold">
              Source
              <select name="source" defaultValue={source} className={inputClass}>
                <option value="">All sources</option>
                {sources.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Sort by
              <select name="sort" defaultValue={sort} className={inputClass}>
                <option value="score">Best score first</option>
                <option value="date">Newest first</option>
              </select>
            </label>
            <button type="submit" className="flex min-h-11 items-center justify-center rounded-[12px] border border-line px-5 font-bold hover:border-accent sm:col-span-2 sm:w-fit">
              Apply filters
            </button>
          </form>

          <p className="mt-4 text-sm text-muted" role="status">
            {rows.length === 0 ? "" : `Showing ${page.length} of ${rows.length} job${rows.length === 1 ? "" : "s"}.`}
          </p>
          {rows.length === 0 && (
            <div className={card}>
              <p className="font-semibold">No jobs fit these filters</p>
              <p className="mt-1 text-sm text-muted">
                {scoreFilter === "matches" ? "Nothing has reached your minimum match yet. Choose “Every scored job” to see what was found." : "Try a lower score or clear the location."}
              </p>
            </div>
          )}
          <ul className="mt-2 space-y-3">
            {page.map((r) => (
              <li key={r.jobs.id} className="rounded-[18px] border border-line bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words text-lg font-bold">
                    <Link href={`/jobs/${r.jobs.id}`} className="hover:text-accent">{r.jobs.title}</Link>
                  </h2>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${scoreChip(r.score)}`} aria-label={`Match score ${r.score} out of 100`}>
                    {r.score}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm text-muted">
                  {[r.jobs.company, r.jobs.location, formatSalary(r.jobs.salary_min, r.jobs.salary_max)].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-2 text-sm">{oneLineReason(r.breakdown)}</p>
                {(r.matching_skills.length > 0 || r.missing_skills.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                    {r.matching_skills.slice(0, 8).map((s) => <span key={s} className="rounded-full bg-green-100 px-2.5 py-1 text-green-800 dark:bg-green-950 dark:text-green-300">{s}</span>)}
                    {r.missing_skills.slice(0, 5).map((s) => <span key={s} className="rounded-full border border-line px-2.5 py-1 text-muted line-through decoration-1">{s}</span>)}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted">
                  {postedLabel(r.jobs.posted_at)} · {sourceLabel(r.jobs.source)} · {applyLabel(r.jobs.apply_method)}
                </p>
              </li>
            ))}
          </ul>
          {rows.length > page.length && (
            <Link href={`/jobs?${more}`} scroll={false} className="mt-4 flex min-h-11 items-center justify-center rounded-[12px] border border-line font-bold hover:border-accent">
              Show more
            </Link>
          )}
          <p className="mt-4 text-xs text-muted">
            Green skills are on your CV; crossed-out skills are in the advert but not on your CV.
            {sources.includes("adzuna") && " Some listings: Jobs by Adzuna."}
          </p>
        </>
      )}
    </div>
  );
}
