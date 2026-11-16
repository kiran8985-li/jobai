import type { NormalizedJob } from "../sources/types";

export type SourceStatus = { name: string; enabled: boolean; last_run: string | null; last_count: number | null; last_error: string | null };

/** Everything the scan needs from the database, so the pipeline can be tested without one. */
export interface ScanStore {
  /** Returns null when another scan is still running. */
  startRun(nowIso: string): Promise<number | null>;
  finishRun(id: number, result: { finished_at: string; new_jobs: number; new_matches: number; applications: number; error: string | null }): Promise<void>;
  getSourceStatus(): Promise<SourceStatus[]>;
  saveSourceStatus(name: string, patch: Partial<Omit<SourceStatus, "name">>): Promise<void>;
  /** Search profiles to scan for. With `userId`, only that user's. */
  getActiveProfiles(userId?: string): Promise<{ roles: string[]; locations: string[] }[]>;
  findJobsByKeys(keys: string[]): Promise<NormalizedJob[]>;
  upsertJobs(jobs: NormalizedJob[]): Promise<void>;
}

/** In-memory store for tests and offline runs. */
export function memoryStore(init: { profiles?: { roles: string[]; locations: string[] }[]; status?: SourceStatus[] } = {}) {
  const jobs = new Map<string, NormalizedJob>();
  const status = new Map<string, SourceStatus>((init.status ?? []).map((s) => [s.name, s]));
  const runs: { id: number; started_at: string; finished_at: string | null; new_jobs: number; new_matches: number; applications: number; error: string | null }[] = [];
  const store: ScanStore = {
    async startRun(nowIso) {
      const open = runs.find((r) => !r.finished_at && Date.parse(nowIso) - Date.parse(r.started_at) < 10 * 60_000);
      if (open) return null;
      runs.push({ id: runs.length + 1, started_at: nowIso, finished_at: null, new_jobs: 0, new_matches: 0, applications: 0, error: null });
      return runs.length;
    },
    async finishRun(id, result) {
      Object.assign(runs[id - 1], result);
    },
    async getSourceStatus() {
      return [...status.values()];
    },
    async saveSourceStatus(name, patch) {
      status.set(name, { name, enabled: true, last_run: null, last_count: null, last_error: null, ...status.get(name), ...patch });
    },
    async getActiveProfiles() {
      return init.profiles ?? [];
    },
    async findJobsByKeys(keys) {
      return keys.map((k) => jobs.get(k)).filter((j): j is NormalizedJob => Boolean(j));
    },
    async upsertJobs(list) {
      for (const j of list) jobs.set(j.dedupe_key, j);
    },
  };
  return { store, jobs, status, runs };
}
