import type { CvProfile } from "../cv/types";
import type { Breakdown, JobForMatch, ProfileForMatch } from "./score";

export type MatchUser = {
  userId: string;
  cv: CvProfile;
  rightToWork?: string;
  profiles: (ProfileForMatch & { id: string; min_match: number })[];
};
export type JobRow = JobForMatch & { id: string };
export type MatchRow = {
  user_id: string;
  search_profile_id: string;
  job_id: string;
  score: number;
  matching_skills: string[];
  missing_skills: string[];
  reasons: string[];
  breakdown: Breakdown | Record<string, never>;
  filtered_reason: string | null;
  ai_reviewed: boolean;
};
export type ReviewCandidate = { id: string; score: number; breakdown: Breakdown; job: JobRow };

/** Everything matching needs from the database, so it can be tested without one. */
export interface MatchStore {
  /** Active, verified users with an approved master CV and at least one active search. */
  listUsers(userId?: string): Promise<MatchUser[]>;
  /** Recent jobs this search has not been scored against yet. */
  jobsToMatch(profileId: string, limit: number): Promise<JobRow[]>;
  saveMatches(rows: MatchRow[]): Promise<void>;
  /** Unreviewed, unfiltered matches for a search at or above a score, best first. */
  matchesToReview(profileId: string, minScore: number, limit: number): Promise<ReviewCandidate[]>;
  saveReview(matchId: string, patch: { score: number; breakdown: Breakdown; reasons: string[]; ai_reviewed: true }): Promise<void>;
}

/** In-memory store for tests. */
export function memoryMatchStore(init: { users: MatchUser[]; jobs: JobRow[] }) {
  const rows: (MatchRow & { id: string })[] = [];
  const store: MatchStore = {
    async listUsers(userId) {
      return init.users.filter((u) => !userId || u.userId === userId);
    },
    async jobsToMatch(profileId, limit) {
      const done = new Set(rows.filter((r) => r.search_profile_id === profileId).map((r) => r.job_id));
      return init.jobs.filter((j) => !done.has(j.id)).slice(0, limit);
    },
    async saveMatches(list) {
      for (const r of list) {
        if (!rows.some((x) => x.search_profile_id === r.search_profile_id && x.job_id === r.job_id)) rows.push({ ...r, id: `m${rows.length + 1}` });
      }
    },
    async matchesToReview(profileId, minScore, limit) {
      return rows
        .filter((r) => r.search_profile_id === profileId && !r.ai_reviewed && !r.filtered_reason && r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((r) => ({ id: r.id, score: r.score, breakdown: r.breakdown as Breakdown, job: init.jobs.find((j) => j.id === r.job_id)! }));
    },
    async saveReview(matchId, patch) {
      Object.assign(rows.find((r) => r.id === matchId)!, patch);
    },
  };
  return { store, rows };
}
