import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Alert } from "@/components/auth-ui";
import { CvPreview, DownloadButtons, FlagsPanel } from "@/components/cv-preview";
import { requireUser } from "@/lib/auth";
import { normalizeProfile } from "@/lib/cv/types";
import { applyLabel, formatSalary, postedLabel, scoreChip, sourceLabel } from "@/lib/match/display";
import type { Breakdown, Part } from "@/lib/match/score";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/status-chip";
import { makeTailoredCv, markApplied, retryApplication } from "./actions";

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

type App = { status: string; method: string | null; sent_at: string | null; created_at: string; detail: Detail };
type Detail = {
  email?: { to: string; subject: string; body: string; attachmentName: string } | null;
  answers?: { question: string; answer: string }[];
  unanswered?: string[];
  skip_reason?: string;
  note?: string;
  why?: string;
  error?: string;
  marked_applied_by_user?: boolean;
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const btn = "flex min-h-11 items-center rounded-[12px] px-5 text-sm font-bold";

/** Says clearly whether the application was sent, is waiting for the user, or was skipped, and what to do. */
function ApplyPanel({ application, job }: { application: App | null; job: { id: string; apply_url: string; apply_method: string } }) {
  const advert = job.apply_url ? (
    <a href={job.apply_url} target="_blank" rel="noopener noreferrer nofollow" className={`${btn} border border-line hover:border-accent`}>
      {application ? "Open the advert to apply" : "View the original advert"}
    </a>
  ) : null;
  if (!application) {
    return (
      <>
        <p className="mt-1 text-sm text-muted">
          {applyLabel(job.apply_method)}. No application has been prepared for this job yet. One is prepared for each match once its CV is ready.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">{advert}</div>
      </>
    );
  }
  const d = application.detail ?? {};
  const act = (action: (f: FormData) => Promise<void>, label: string, cls: string) => (
    <form action={action}>
      <input type="hidden" name="job_id" value={job.id} />
      <button type="submit" className={`${btn} ${cls}`}>{label}</button>
    </form>
  );
  const markButton = act(markApplied, "Mark as applied", "bg-accent text-white hover:bg-accent-hover");
  const status = application.status;
  return (
    <div className="mt-2 space-y-3 text-sm">
      {status === "sent" && (
        <p>
          <strong>{d.marked_applied_by_user ? "You marked this as applied" : "Sent for you by email"}</strong>
          {application.sent_at ? ` on ${when(application.sent_at)}` : ""}. {d.marked_applied_by_user ? "" : "Replies go to your own email address."}
        </p>
      )}
      {(status === "dry_run" || status === "prepared") && (
        <p><strong>{status === "dry_run" ? "Prepared, not sent." : "Prepared, but sending did not finish."}</strong> {d.note ?? "It was not sent automatically. You can apply yourself with the details below."}</p>
      )}
      {status === "manual" && (
        <p><strong>Waiting for you.</strong> {d.why ?? ""} Your CV for this job is ready above: download it, apply, then mark it as applied.</p>
      )}
      {status === "skipped" && <p><strong>Not applied for.</strong> {d.skip_reason}</p>}
      {status === "failed" && <p><strong>Sending failed{d.error ? ` (${d.error})` : ""}.</strong> You can apply yourself with the details below, or try again.</p>}

      {(d.unanswered?.length ?? 0) > 0 && status !== "skipped" && (
        <p className="text-muted">This job also asks: {d.unanswered!.join("; ")}. You will need to answer that yourself.</p>
      )}
      {(d.answers?.length ?? 0) > 0 && (
        <div>
          <p className="font-semibold">Your saved answers for this job</p>
          <ul className="mt-1 list-disc pl-5">{d.answers!.map((a, i) => <li key={i}>{a.question}: {a.answer}</li>)}</ul>
        </div>
      )}
      {d.email && (
        <details className="rounded-[12px] border border-line p-3" open={status === "dry_run"}>
          <summary className="cursor-pointer font-semibold">{status === "sent" && !d.marked_applied_by_user ? "The email that was sent" : "The prepared email"}</summary>
          <dl className="mt-2 space-y-1">
            <div><dt className="inline text-muted">To: </dt><dd className="inline break-all">{d.email.to}</dd></div>
            <div><dt className="inline text-muted">Subject: </dt><dd className="inline">{d.email.subject}</dd></div>
            <div><dt className="inline text-muted">Attached: </dt><dd className="inline break-all">{d.email.attachmentName}</dd></div>
          </dl>
          <p className="mt-2 whitespace-pre-line break-words rounded-[10px] bg-page p-3">{d.email.body}</p>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        {status !== "sent" && advert}
        {status !== "sent" && markButton}
        {(status === "skipped" || status === "failed") && act(retryApplication, "Try again", "border border-line hover:border-accent")}
        {status === "skipped" && (
          <Link href="/auto-apply" className={`${btn} text-accent hover:bg-accent-tint`}>Add the answer</Link>
        )}
      </div>
    </div>
  );
}

const CV_MESSAGES: Record<string, { kind: "error" | "notice"; text: string }> = {
  made: { kind: "notice", text: "Your tailored CV is ready. Check it below." },
  no_master_cv: { kind: "error", text: "Approve a master CV first, then try again." },
  no_match: { kind: "error", text: "This job is not one of your scored jobs, so a CV cannot be tailored for it." },
  no_job: { kind: "error", text: "This job is no longer available." },
  failed: { kind: "error", text: "We could not create the CV just now. Please try again." },
};

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cv?: string; apply?: string }> }) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;
  const cvMsg = CV_MESSAGES[sp.cv ?? ""];
  const [{ data: application }, { data: tailored }, { data: job }, { data: matches }] = await Promise.all([
    supabase.from("applications").select("status, method, detail, sent_at, created_at").eq("job_id", id.data).eq("user_id", user.id).maybeSingle(),
    supabase.from("tailored_cvs").select("content_json, flags, method, updated_at").eq("job_id", id.data).eq("user_id", user.id).maybeSingle(),
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

      <section className={card} aria-labelledby="tailored" id="tailored">
        <h2 className="text-lg font-bold">Your CV for this job</h2>
        {cvMsg && <Alert kind={cvMsg.kind}>{cvMsg.text}</Alert>}
        {tailored ? (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-muted">
              {tailored.method === "ai"
                ? "Tailored with AI, then fact-checked against your master CV."
                : "Your own wording, reordered so the most relevant skills and bullets come first. No AI rewording."}{" "}
              Made on {new Date(tailored.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
            <FlagsPanel flags={tailored.flags ?? []} />
            <CvPreview cv={normalizeProfile(tailored.content_json)} />
            <div className="flex flex-wrap items-center gap-2">
              <DownloadButtons base={`/api/cvs/tailored/${job.id}`} />
              <form action={makeTailoredCv}>
                <input type="hidden" name="job_id" value={job.id} />
                <button type="submit" className="flex min-h-11 items-center rounded-[12px] px-4 text-sm font-bold text-accent hover:bg-accent-tint">Make it again</button>
              </form>
            </div>
          </div>
        ) : match ? (
          <>
            <p className="mt-1 text-sm text-muted">
              We can prepare a version of your master CV for this job: your most relevant skills and bullets first. Nothing is added that is not on your master CV.
            </p>
            <form action={makeTailoredCv} className="mt-3">
              <input type="hidden" name="job_id" value={job.id} />
              <button type="submit" className="flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover">Create a tailored CV</button>
            </form>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">A tailored CV is only made for jobs that are scored against your searches.</p>
        )}
      </section>

      <section className={card} aria-labelledby="apply-h" id="apply">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="apply-h" className="text-lg font-bold">Applying</h2>
          {application && <StatusChip status={application.status} />}
        </div>
        {sp.apply === "retry" && !application && <Alert kind="notice">Cleared. This job will be looked at again at the next check.</Alert>}
        <ApplyPanel application={application as App | null} job={job} />
      </section>

      <section className={card} aria-labelledby="desc-h">
        <h2 id="desc-h" className="text-lg font-bold">Job description</h2>
        <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed">{job.description || "No description was provided."}</p>
      </section>
    </div>
  );
}
