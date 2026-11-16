import { adminButton, adminCard, adminDanger, adminPrimary, when } from "@/components/admin-blocks";
import { Alert } from "@/components/auth-ui";
import { adminDb } from "@/lib/admin/data";
import { env } from "@/lib/env";
import { sourceLabel } from "@/lib/match/display";
import { createSources } from "@/lib/sources/connectors";
import { runSourceNow, setSourceEnabled } from "../actions";

export const metadata = { title: "Job sources – Admin" };

const NEEDS: Record<string, string> = {
  adzuna: "ADZUNA_APP_ID and ADZUNA_APP_KEY",
  reed: "REED_API_KEY",
  greenhouse: "GREENHOUSE_BOARDS (company board names)",
  lever: "LEVER_COMPANIES (company names)",
  demo: "DEMO_SOURCE=true",
};

function message(sp: { msg?: string; source?: string; count?: string }) {
  const name = sp.source ? sourceLabel(sp.source) : "The source";
  switch (sp.msg) {
    case "on": return { kind: "notice" as const, text: `${name} switched on. It runs from the next scan.` };
    case "off": return { kind: "notice" as const, text: `${name} switched off. Scans will skip it until you switch it back on.` };
    case "ran": return { kind: "notice" as const, text: `${name} ran: ${Number(sp.count) || 0} jobs fetched.` };
    case "busy": return { kind: "error" as const, text: "A scan is already running. Try again in a few minutes." };
    case "state_disabled": return { kind: "error" as const, text: `${name} is switched off. Switch it on to run it.` };
    case "state_not_configured": return { kind: "error" as const, text: `${name} is not set up: it needs ${NEEDS[sp.source ?? ""] ?? "its settings"}.` };
    case "state_no_searches": return { kind: "error" as const, text: `${name} has nothing to search for yet: no user has an active search.` };
    case "state_failed": return { kind: "error" as const, text: `${name} failed. See its last error below.` };
    case "failed": return { kind: "error" as const, text: "The run did not finish. Please try again." };
    default: return null;
  }
}

export default async function AdminSources({ searchParams }: { searchParams: Promise<{ msg?: string; source?: string; count?: string }> }) {
  const { db } = await adminDb();
  const sp = await searchParams;
  const e = env();
  const { data } = await db.from("source_status").select("name, enabled, last_run, last_count, last_error");
  const status = new Map((data ?? []).map((s) => [s.name as string, s]));
  const sources = createSources(e);
  const msg = message(sp);

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Job sources</h1>
      <p className="mt-2 text-sm text-muted">
        Company boards run every scan; Adzuna and Reed about every {e.API_SOURCES_MIN_INTERVAL_MIN} minutes. There is no LinkedIn or Indeed source.
      </p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <ul className="mt-4 space-y-3">
        {sources.map((s) => {
          const st = status.get(s.name);
          const enabled = st?.enabled ?? true;
          const configured = s.configured();
          return (
            <li key={s.name} className={adminCard} data-source={s.name}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">{sourceLabel(s.name)}</h2>
                  <p className="text-sm text-muted">{s.kind === "api" ? "Official API, about hourly" : s.name === "demo" ? "Sample jobs, every scan" : "Company job boards, every scan"}</p>
                </div>
                <span data-source-state className={`rounded-full px-3 py-1 text-xs font-bold ${!configured ? "border border-line text-muted" : enabled ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                  {!configured ? "Not set up" : enabled ? "On" : "Switched off"}
                </span>
              </div>
              <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-3">
                <div><dt className="inline text-muted">Last run: </dt><dd className="inline">{when(st?.last_run)}</dd></div>
                <div><dt className="inline text-muted">Jobs last run: </dt><dd className="inline">{st?.last_count ?? "None"}</dd></div>
                <div className="sm:col-span-3"><dt className="inline text-muted">Last error: </dt><dd className="inline break-words">{st?.last_error ? <span className="text-red-700 dark:text-red-300">{st.last_error}</span> : "None"}</dd></div>
              </dl>
              {!configured && <p className="mt-2 text-sm text-muted">Needs {NEEDS[s.name]} in the settings.</p>}
              {s.name === "adzuna" && configured && <p className="mt-2 text-xs text-muted">Free Adzuna keys are for evaluation. A commercial licence is needed before charging customers.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {(configured || !enabled) && (
                <form action={setSourceEnabled}>
                  <input type="hidden" name="name" value={s.name} />
                  <input type="hidden" name="enabled" value={String(!enabled)} />
                  <button type="submit" className={enabled ? adminDanger : adminPrimary}>{enabled ? "Switch off" : "Switch on"}</button>
                </form>
                )}
                {configured && enabled && (
                  <form action={runSourceNow}>
                    <input type="hidden" name="name" value={s.name} />
                    <button type="submit" className={adminButton}>Run now</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
