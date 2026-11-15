import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedJob } from "../sources/types";
import type { ScanStore, SourceStatus } from "./store";

const JOB_COLUMNS =
  "source, external_id, title, company, location, salary_min, salary_max, employment_type, description, apply_url, apply_email, apply_method, questions, posted_at, dedupe_key, also_on";
const STALE_RUN_MS = 10 * 60_000;

function chunks<T>(list: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
}
const must = <T>(res: { data: T; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data;
};

/** The scan's database access. `db` must be the service-role client: the scan writes shared tables. */
export function supabaseScanStore(db: SupabaseClient): ScanStore {
  return {
    async startRun(nowIso) {
      const since = new Date(Date.parse(nowIso) - STALE_RUN_MS).toISOString();
      const open = must(await db.from("scan_runs").select("id").is("finished_at", null).gte("started_at", since).limit(1));
      if (open && open.length) return null;
      const row = must(await db.from("scan_runs").insert({ started_at: nowIso }).select("id").single());
      return row!.id as number;
    },
    async finishRun(id, result) {
      must(await db.from("scan_runs").update(result).eq("id", id));
    },
    async getSourceStatus() {
      return (must(await db.from("source_status").select("name, enabled, last_run, last_count, last_error")) ?? []) as SourceStatus[];
    },
    async saveSourceStatus(name, patch) {
      // Never writes `enabled`: only an admin changes that.
      const { enabled: _ignored, ...rest } = patch;
      void _ignored;
      must(await db.from("source_status").upsert({ name, ...rest }, { onConflict: "name" }));
    },
    async getActiveProfiles(userId) {
      const users = must(await db.from("profiles_user").select("id").eq("is_active", true)) ?? [];
      const ids = users.map((u) => u.id as string).filter((id) => !userId || id === userId);
      if (!ids.length) return [];
      return (must(await db.from("search_profiles").select("roles, locations").eq("is_active", true).in("user_id", ids)) ?? []) as {
        roles: string[];
        locations: string[];
      }[];
    },
    async findJobsByKeys(keys) {
      const out: NormalizedJob[] = [];
      for (const part of chunks(keys, 100)) {
        out.push(...((must(await db.from("jobs").select(JOB_COLUMNS).in("dedupe_key", part)) ?? []) as unknown as NormalizedJob[]));
      }
      return out;
    },
    async upsertJobs(jobs) {
      for (const part of chunks(jobs, 200)) {
        must(await db.from("jobs").upsert(part, { onConflict: "dedupe_key" }));
      }
    },
  };
}
