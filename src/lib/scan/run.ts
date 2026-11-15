import { dedupeJobs, mergeJobs } from "../sources/dedupe";
import { createHttp } from "../sources/http";
import type { Http, JobSource, NormalizedJob } from "../sources/types";
import { buildQueries, pickApiQueries } from "./queries";
import type { ScanStore } from "./store";

export type SourceOutcome = { name: string; state: "ran" | "failed" | "disabled" | "not_configured" | "not_due" | "no_searches"; count: number; error: string | null };
export type ScanResult = { status: "done" | "already_running"; runId: number | null; newJobs: number; newMatches: number; totalFetched: number; sources: SourceOutcome[]; matchError?: string };

export type ScanOptions = {
  store: ScanStore;
  sources: JobSource[];
  /** Minutes between runs of API sources (Adzuna, Reed). Company feeds run every scan. */
  apiMinIntervalMin: number;
  now?: () => number;
  /** Run only this source, ignoring its interval ("run one source now" in the admin panel). */
  only?: string;
  /** Scan only for this user's search profiles ("Run scan now" for a signed-in user). */
  userId?: string;
  httpFor?: (source: JobSource) => Http;
  /** Runs after jobs are saved: scores them against the searches and returns how many new matches. */
  match?: () => Promise<number>;
};

/**
 * One scan: fetch from every enabled source → normalise → deduplicate → store.
 * One failing source never stops the others. Safe to run repeatedly: jobs are keyed on
 * dedupe_key, so a second run updates rows instead of adding duplicates.
 * Then scores the jobs against every active search (`match`). Tailoring and applying come in later phases.
 */
export async function runScan(opts: ScanOptions): Promise<ScanResult> {
  const { store, sources } = opts;
  const now = opts.now ?? Date.now;
  const httpFor = opts.httpFor ?? (() => createHttp());
  const iso = () => new Date(now()).toISOString();

  const runId = await store.startRun(iso());
  if (runId === null) return { status: "already_running", runId: null, newJobs: 0, newMatches: 0, totalFetched: 0, sources: [] };

  let newJobs = 0;
  let totalFetched = 0;
  let fatal: string | null = null;
  let outcomes: SourceOutcome[] = [];
  try {
    const statusList = await store.getSourceStatus();
    const status = new Map(statusList.map((s) => [s.name, s]));
    const queries = buildQueries(await store.getActiveProfiles(opts.userId));
    const intervalMs = opts.apiMinIntervalMin * 60_000;
    const runIndex = intervalMs > 0 ? Math.floor(now() / intervalMs) : 0;

    // Sources run side by side; each has its own one-request-a-second limiter.
    const results = await Promise.all(
      sources
        .filter((s) => !opts.only || s.name === opts.only)
        .map(async (source): Promise<{ outcome: SourceOutcome; jobs: NormalizedJob[] }> => {
          const skip = (state: SourceOutcome["state"]) => ({ outcome: { name: source.name, state, count: 0, error: null }, jobs: [] });
          const st = status.get(source.name);
          if (!source.configured()) return skip("not_configured");
          // First time this source is seen: record it so it can be switched on and off.
          if (!st) await store.saveSourceStatus(source.name, {});
          if (st && !st.enabled) return skip("disabled");
          // Real sources have nothing to look for until someone has a search. The demo always runs.
          if (queries.length === 0 && source.name !== "demo") return skip("no_searches");
          if (source.kind === "api" && !opts.only && st?.last_run && now() - Date.parse(st.last_run) < intervalMs) return skip("not_due");

          let jobs: NormalizedJob[] = [];
          let errors: string[] = [];
          try {
            const q = source.kind === "api" ? pickApiQueries(queries, runIndex) : queries;
            ({ jobs, errors } = await source.fetch(q, httpFor(source)));
          } catch {
            // Connector bugs must not leak details or stop other sources.
            errors = ["Unexpected error"];
          }
          const error = errors.length ? errors.join("; ").slice(0, 500) : null;
          await store.saveSourceStatus(source.name, { last_run: iso(), last_count: jobs.length, last_error: error });
          return { outcome: { name: source.name, state: error && !jobs.length ? "failed" : "ran", count: jobs.length, error }, jobs };
        }),
    );
    outcomes = results.map((r) => r.outcome);

    const fetched = dedupeJobs(results.flatMap((r) => r.jobs));
    totalFetched = fetched.length;
    const existing = new Map((await store.findJobsByKeys(fetched.map((j) => j.dedupe_key))).map((j) => [j.dedupe_key, j]));
    newJobs = fetched.filter((j) => !existing.has(j.dedupe_key)).length;
    const toSave = fetched.map((j) => (existing.has(j.dedupe_key) ? mergeJobs(existing.get(j.dedupe_key)!, j) : j));
    await store.upsertJobs(toSave);
  } catch {
    fatal = "Scan failed while saving jobs";
  }
  // Matching problems are recorded but never undo the jobs that were saved.
  let newMatches = 0;
  let matchError: string | undefined;
  if (!fatal && opts.match) {
    try {
      newMatches = await opts.match();
    } catch {
      matchError = "Matching failed";
    }
  }
  await store.finishRun(runId, { finished_at: iso(), new_jobs: newJobs, new_matches: newMatches, error: fatal ?? matchError ?? null });
  if (fatal) throw new Error(fatal);
  return { status: "done", runId, newJobs, newMatches, totalFetched, sources: outcomes, ...(matchError ? { matchError } : {}) };
}
