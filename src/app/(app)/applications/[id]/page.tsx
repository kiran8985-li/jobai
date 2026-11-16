import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CvPreview, DownloadButtons, FlagsPanel } from "@/components/cv-preview";
import { StatusChip } from "@/components/status-chip";
import { requireUser } from "@/lib/auth";
import { normalizeProfile } from "@/lib/cv/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Application – JobPilot AI" };

type Detail = {
  email?: { to: string; subject: string; body: string; attachmentName: string } | null;
  answers?: { question: string; answer: string }[];
  skip_reason?: string;
  note?: string;
  why?: string;
  error?: string;
  marked_applied_by_user?: boolean;
};
const card = "mt-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** One application in full: what happened, the email, and the exact CV version prepared for it. */
export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: app } = await supabase
    .from("applications")
    .select("id, status, method, detail, created_at, sent_at, job_id, jobs(id, title, company, location, apply_url)")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!app) notFound();
  const { data: tailored } = await supabase.from("tailored_cvs").select("content_json, flags, method, updated_at").eq("user_id", user.id).eq("job_id", app.job_id).maybeSingle();
  const job = app.jobs as unknown as { id: string; title: string; company: string; location: string; apply_url: string } | null;
  const d = (app.detail ?? {}) as Detail;

  const what =
    app.status === "sent" ? (d.marked_applied_by_user ? "You marked this as applied." : "Sent for you by email. Replies go to your own email address.")
    : app.status === "manual" ? `Waiting for you. ${d.why ?? ""}`
    : app.status === "skipped" ? `Not applied for. ${d.skip_reason ?? ""}`
    : app.status === "failed" ? `Sending failed${d.error ? ` (${d.error})` : ""}. You can apply yourself.`
    : d.note ?? "Prepared, not sent.";

  return (
    <div className="max-w-3xl">
      <Link href="/applications" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">Back to applications</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{job?.title ?? "Job no longer listed"}</h1>
        <StatusChip status={app.status} />
      </div>
      <p className="mt-1 break-words text-muted">{[job?.company, job?.location].filter(Boolean).join(" · ")}</p>

      <section className={card} aria-labelledby="what-h">
        <h2 id="what-h" className="text-lg font-bold">What happened</h2>
        <p className="mt-2 text-sm">{what}</p>
        <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">Prepared: </dt><dd className="inline">{when(app.created_at)}</dd></div>
          {app.sent_at && <div><dt className="inline text-muted">{d.marked_applied_by_user ? "Marked applied: " : "Sent: "}</dt><dd className="inline">{when(app.sent_at)}</dd></div>}
          <div><dt className="inline text-muted">How: </dt><dd className="inline">{app.method === "email" ? "By email" : "On the employer's site"}</dd></div>
        </dl>
        {job && (
          <Link href={`/jobs/${job.id}#apply`} className="mt-4 inline-flex min-h-11 items-center rounded-[12px] border border-line px-5 text-sm font-bold hover:border-accent">
            Open the job page
          </Link>
        )}
      </section>

      {(d.answers?.length ?? 0) > 0 && (
        <section className={card} aria-labelledby="ans-h">
          <h2 id="ans-h" className="text-lg font-bold">Your answers used</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">{d.answers!.map((a, i) => <li key={i}>{a.question}: {a.answer}</li>)}</ul>
        </section>
      )}

      {d.email && (
        <section className={card} aria-labelledby="email-h">
          <h2 id="email-h" className="text-lg font-bold">{app.status === "sent" && !d.marked_applied_by_user ? "The email that was sent" : "The prepared email"}</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div><dt className="inline text-muted">To: </dt><dd className="inline break-all">{d.email.to}</dd></div>
            <div><dt className="inline text-muted">Subject: </dt><dd className="inline">{d.email.subject}</dd></div>
            <div><dt className="inline text-muted">Attached: </dt><dd className="inline break-all">{d.email.attachmentName}</dd></div>
          </dl>
          <p className="mt-3 whitespace-pre-line break-words rounded-[12px] bg-page p-4 text-sm">{d.email.body}</p>
        </section>
      )}

      <section className={card} aria-labelledby="cv-h">
        <h2 id="cv-h" className="text-lg font-bold">The CV for this application</h2>
        {tailored ? (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-muted">
              {tailored.method === "ai" ? "Tailored with AI, then fact-checked against your master CV." : "Your own wording, reordered for this job."}{" "}
              Made on {new Date(tailored.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
            <FlagsPanel flags={tailored.flags ?? []} />
            <CvPreview cv={normalizeProfile(tailored.content_json)} />
            <DownloadButtons base={`/api/cvs/tailored/${app.job_id}`} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">The CV version for this application is no longer stored.</p>
        )}
      </section>
    </div>
  );
}
