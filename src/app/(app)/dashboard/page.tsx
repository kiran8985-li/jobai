import Link from "next/link";
import { Alert } from "@/components/auth-ui";
import { ScanButton } from "@/components/scan-button";
import { StatusChip } from "@/components/status-chip";
import { requireUser } from "@/lib/auth";
import { hasAiConsent, listCvs } from "@/lib/cv/store";
import { env } from "@/lib/env";
import { scoreChip } from "@/lib/match/display";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scanNow } from "./actions";

export const metadata = { title: "Dashboard – JobPilot AI" };

const card = "rounded-[18px] border border-line bg-surface p-5 sm:p-6";
const cta = "inline-flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover";
const STATUS_ORDER = ["sent", "manual", "dry_run", "skipped", "failed"] as const;
const STATUS_HELP: Record<string, string> = {
  sent: "Sent",
  manual: "Waiting for you",
  dry_run: "Prepared (test mode)",
  skipped: "Skipped",
  failed: "Failed",
};

function ago(iso: string | null): string {
  if (!iso) return "not yet";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function scanMessage(sp: Record<string, string | undefined>): { kind: "notice" | "error"; text: string } | null {
  switch (sp.scan) {
    case "done": {
      const [j, m, a] = [Number(sp.jobs) || 0, Number(sp.matches) || 0, Number(sp.apps) || 0];
      return { kind: "notice", text: `Scan finished: ${j} new job${j === 1 ? "" : "s"}, ${m} new match${m === 1 ? "" : "es"}, ${a} application${a === 1 ? "" : "s"} prepared or sent.` };
    }
    case "cooldown":
      return { kind: "error", text: `You can run a scan once every 10 minutes. Try again in ${Number(sp.wait) || 10} minute${sp.wait === "1" ? "" : "s"}. New jobs are also checked automatically every 15 minutes.` };
    case "busy":
      return { kind: "error", text: "A scan is already running. Your results will appear here in a few minutes." };
    case "not_ready":
      return { kind: "error", text: "Approve your CV and add a job search first, then run a scan." };
    case "failed":
    case "not_configured":
      return { kind: "error", text: "The scan did not finish. Please try again later." };
    default:
      return null;
  }
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const cvs = (await hasAiConsent(supabase, user.id)) ? await listCvs(supabase, user.id) : [];
  const master = cvs.find((c) => c.approved);
  const draft = cvs.find((c) => !c.approved);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: profiles }, { data: apps }, { data: matches }] = await Promise.all([
    supabase.from("search_profiles").select("id, min_match, auto_apply, consent_at, is_active").eq("user_id", user.id),
    supabase.from("applications").select("id, status, created_at, jobs(id, title, company)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
    supabase
      .from("matches")
      .select("score, search_profile_id, created_at, jobs!inner(id, title, company, location)")
      .eq("user_id", user.id)
      .is("filtered_reason", null)
      .gte("created_at", since)
      .order("score", { ascending: false })
      .limit(200),
  ]);
  // Scan history is admin-only data; the dashboard only needs the time of the last finished scan.
  const e = env();
  let lastScan: string | null = null;
  if (e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await createSupabaseAdminClient().from("scan_runs").select("finished_at").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1);
    lastScan = (data?.[0]?.finished_at as string | undefined) ?? null;
  }

  const searches = profiles ?? [];
  const minFor = new Map(searches.map((p) => [p.id as string, p.min_match as number]));
  type M = { score: number; search_profile_id: string; jobs: { id: string; title: string; company: string; location: string } };
  const seen = new Set<string>();
  const newMatches = ((matches ?? []) as unknown as M[]).filter((m) => {
    if (m.score < (minFor.get(m.search_profile_id) ?? 75) || seen.has(m.jobs.id)) return false;
    seen.add(m.jobs.id);
    return true;
  });
  type A = { id: string; status: string; created_at: string; jobs: { id: string; title: string; company: string } | null };
  const applications = (apps ?? []) as unknown as A[];
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, applications.filter((a) => a.status === s).length])) as Record<string, number>;
  const attention = applications.filter((a) => a.status === "skipped" || a.status === "failed" || a.status === "manual").slice(0, 5);
  const autoOn = searches.some((p) => p.auto_apply && p.consent_at && p.is_active);
  const msg = scanMessage(sp);

  const next = !master
    ? draft
      ? { title: "Review and approve your CV", body: "We have read your CV. Check it and approve it so it can be used.", href: `/cvs/${draft.id}/review`, cta: "Review my CV" }
      : { title: "Upload your CV", body: "Start by uploading your CV. You check and approve it before anything is used.", href: "/onboarding", cta: "Get started" }
    : !searches.length
      ? { title: "Tell us what jobs you want", body: "Add your first search: job titles, locations, salary and limits.", href: "/onboarding/preferences", cta: "Set my preferences" }
      : null;

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-extrabold tracking-tight">{user.name ? `Welcome, ${user.name.split(" ")[0]}` : "Welcome"}</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {next ? (
        <div className={`mt-6 ${card}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-accent">Next step</p>
          <p className="mt-1 text-lg font-bold">{next.title}</p>
          <p className="mt-1 text-sm text-muted">{next.body}</p>
          <Link href={next.href} className={`mt-4 ${cta}`}>{next.cta}</Link>
          <ol className="mt-6 space-y-2 text-sm text-muted">
            <li className={master || draft ? "line-through" : ""}>1. Upload your CV</li>
            <li className={master ? "line-through" : ""}>2. Check and approve it</li>
            <li className={searches.length ? "line-through" : ""}>3. Tell us which jobs you want</li>
            <li>4. Matches and prepared applications appear here</li>
          </ol>
        </div>
      ) : (
        <>
          <div className={`mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${card}`}>
            <div>
              <p className="text-sm text-muted">Last check for new jobs</p>
              <p className="text-lg font-bold" data-last-scan>{ago(lastScan)}</p>
              <p className="mt-1 text-sm text-muted">
                Jobs are checked every 15 minutes. Auto-apply is {autoOn ? "on" : "off"}
                {e.APPLY_MODE === "dry_run" ? ", in test mode: nothing is sent." : "."}{" "}
                <Link href="/auto-apply" className="font-semibold text-accent">Settings</Link>
              </p>
            </div>
            <ScanButton action={scanNow} />
          </div>

          <section aria-labelledby="apps-h" className="mt-6">
            <h2 id="apps-h" className="text-xl font-extrabold">Applications</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {STATUS_ORDER.map((s) => (
                <li key={s}>
                  <Link href={`/applications?status=${s}`} className={`block h-full ${card} hover:border-accent`} data-count={s}>
                    <span className="block text-3xl font-extrabold tabular-nums">{counts[s]}</span>
                    <span className="mt-1 block text-sm text-muted">{STATUS_HELP[s]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="att-h" className={card}>
              <h2 id="att-h" className="text-lg font-bold">Needs your attention</h2>
              {attention.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing right now. Skipped applications and ones waiting for you will appear here.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {attention.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                      <Link href={a.jobs ? `/jobs/${a.jobs.id}#apply` : "/applications"} className="min-w-0 break-words text-sm font-semibold hover:text-accent">
                        {a.jobs ? `${a.jobs.title}${a.jobs.company ? `, ${a.jobs.company}` : ""}` : "Job no longer listed"}
                      </Link>
                      <StatusChip status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/applications" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-accent">All applications</Link>
            </section>

            <section aria-labelledby="new-h" className={card}>
              <h2 id="new-h" className="text-lg font-bold">New matches this week</h2>
              {newMatches.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No new matches in the last 7 days. Try widening a search, or run a scan now.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {newMatches.slice(0, 5).map((m) => (
                    <li key={m.jobs.id} className="flex items-center justify-between gap-3 py-3">
                      <Link href={`/jobs/${m.jobs.id}`} className="min-w-0 text-sm hover:text-accent">
                        <span className="block break-words font-semibold">{m.jobs.title}</span>
                        <span className="block break-words text-muted">{[m.jobs.company, m.jobs.location].filter(Boolean).join(" · ")}</span>
                      </Link>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${scoreChip(m.score)}`} aria-label={`Match score ${m.score}`}>{m.score}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/jobs" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-accent">
                {newMatches.length > 5 ? `See all ${newMatches.length} matches` : "See your jobs"}
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
