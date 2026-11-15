import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { applyLabel, formatSalary, postedLabel, scoreChip, sourceLabel } from "@/lib/match/display";
import type { Breakdown, Part } from "@/lib/match/score";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Job – JobPilot AI" };

const card = "mt-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6";

function Bar({ label, part }: { label: string; part: Part }) {
  const pct = Math.round((part.points / part.max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-bold tabular-nums">{part.points} of {part.max}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-accent-tint" role="img" aria-label={`${label}: ${part.points} out of ${part.max}`}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm text-muted">{part.reason}</p>
    </div>
  );
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: job }, { data: matches }] = await Promise.all([
    supabase.from("jobs").select("id, title, company, location, salary_min, salary_max, employment_type, description, apply_url, apply_method, source, posted_at, also_on").eq("id", id.data).maybeSingle(),
    supabase.from("matches").select("score, matching_skills, missing_skills, breakdown, filtered_reason, ai_reviewed, search_profiles(name, min_match)").eq("job_id", id.data).eq("user_id", user.id).order("score", { ascending: false }),
  ]);
  if (!job) notFound();

  type M = { score: number; matching_skills: string[]; missing_skills: string[]; breakdown: Breakdown; filtered_reason: string | null; search_profiles: { name: string; min_match: number } | null };
  const rows = (matches ?? []) as unknown as M[];
  const match = rows.find((m) => !m.filtered_reason);
  const filtered = rows.filter((m) => m.filtered_reason);
  const b = match?.breakdown;
  const min = match?.search_profiles?.min_match ?? 75;

  return (
    <div className="max-w-3xl">
      <Link href="/jobs" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">Back to jobs</Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{job.title}</h1>
        {match && (
          <span className={`shrink-0 rounded-full px-4 py-1.5 text-lg font-extrabold ${scoreChip(match.score)}`} aria-label={`Match score ${match.score} out of 100`}>
            {match.score}
          </span>
        )}
      </div>
      <p className="mt-2 break-words text-muted">{[job.company, job.location, formatSalary(job.salary_min, job.salary_max), job.employment_type].filter(Boolean).join(" · ")}</p>
      <p className="mt-1 text-sm text-muted">
        {postedLabel(job.posted_at)} · {sourceLabel(job.source)}
        {job.also_on.length > 0 && ` · also on ${job.also_on.map(sourceLabel).join(", ")}`}
        {(job.source === "adzuna" || job.also_on.includes("adzuna")) && " · Jobs by Adzuna"}
      </p>

      {match && b ? (
        <section className={card} aria-labelledby="why-h">
          <h2 id="why-h" className="text-lg font-bold">Why this score</h2>
          <p className="mt-1 text-sm text-muted">
            {match.score >= min
              ? `${match.score} is at or above your minimum match of ${min} for “${match.search_profiles?.name ?? "your search"}”.`
              : `${match.score} is below your minimum match of ${min} for “${match.search_profiles?.name ?? "your search"}”, so this job is not treated as a match.`}
          </p>
          <div className="mt-4 space-y-4">
            <Bar label="Job title" part={b.role} />
            <Bar label="Skills" part={b.skills} />
            <Bar label="Location" part={b.location} />
            <Bar label="Salary" part={b.salary} />
          </div>
          {b.ai && (
            <p className="mt-4 rounded-[12px] border border-line p-3 text-sm">
              <strong>AI eligibility check:</strong> {b.ai.eligible ? "looks eligible" : "may not be eligible"}
              {b.ai.adjustment !== 0 && ` (${b.ai.adjustment > 0 ? "+" : ""}${b.ai.adjustment} points)`}
              {b.ai.reason && `. ${b.ai.reason}`}
            </p>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold">Skills you have ({match.matching_skills.length})</h3>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                {match.matching_skills.length === 0 && <span className="text-muted">None found</span>}
                {match.matching_skills.map((s) => <span key={s} className="rounded-full bg-green-100 px-2.5 py-1 text-green-800 dark:bg-green-950 dark:text-green-300">{s}</span>)}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold">In the advert, not on your CV ({match.missing_skills.length})</h3>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                {match.missing_skills.length === 0 && <span className="text-muted">None</span>}
                {match.missing_skills.map((s) => <span key={s} className="rounded-full border border-line px-2.5 py-1 text-muted">{s}</span>)}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className={card}>
          <h2 className="text-lg font-bold">{filtered.length ? "Left out of your matches" : "Not scored yet"}</h2>
          {filtered.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {filtered.map((m, i) => <li key={i}>{m.filtered_reason}{m.search_profiles?.name ? ` (search: ${m.search_profiles.name})` : ""}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">This job has not been scored against your searches yet. It will be at the next check.</p>
          )}
        </section>
      )}

      <section className={card} aria-labelledby="apply-h">
        <h2 id="apply-h" className="text-lg font-bold">Applying</h2>
        <p className="mt-1 text-sm text-muted">{applyLabel(job.apply_method)}. Tailored CVs and prepared applications arrive in the next part of JobPilot AI.</p>
        {job.apply_url && (
          <a href={job.apply_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-flex min-h-11 items-center rounded-[12px] border border-line px-5 font-bold hover:border-accent">
            View the original advert
          </a>
        )}
      </section>

      <section className={card} aria-labelledby="desc-h">
        <h2 id="desc-h" className="text-lg font-bold">Job description</h2>
        <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed">{job.description || "No description was provided."}</p>
      </section>
    </div>
  );
}
