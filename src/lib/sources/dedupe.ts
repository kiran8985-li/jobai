import type { ApplyMethod, NormalizedJob } from "./types";

const RANK: Record<ApplyMethod, number> = { email: 3, ats: 2, manual: 1 };

/**
 * Two records of the same vacancy → one. Keeps the version that is easiest to apply to
 * (email > ats > manual) and records the other places it was seen in `also_on`.
 * `existing` wins ties, so a stored job does not flip between sources from scan to scan.
 */
export function mergeJobs(existing: NormalizedJob, incoming: NormalizedJob): NormalizedJob {
  const sameSource = existing.source === incoming.source;
  const winner = sameSource || RANK[incoming.apply_method] > RANK[existing.apply_method] ? incoming : existing;
  const loser = winner === incoming ? existing : incoming;
  const also = new Set([...existing.also_on, ...incoming.also_on, loser.source]);
  also.delete(winner.source);
  return { ...winner, also_on: [...also].sort() };
}

/** Collapses a batch so each vacancy appears once. */
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const byKey = new Map<string, NormalizedJob>();
  for (const job of jobs) {
    const seen = byKey.get(job.dedupe_key);
    byKey.set(job.dedupe_key, seen ? mergeJobs(seen, job) : job);
  }
  return [...byKey.values()];
}
