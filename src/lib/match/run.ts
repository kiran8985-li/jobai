import type { AIDeps } from "../ai";
import { MAX_AI_REVIEWS_PER_SCAN, REVIEW_MARGIN, applyReview, candidateSummary, reviewMatch } from "./ai-review";
import { cvSkillSet, scoreJob } from "./score";
import type { MatchRow, MatchStore } from "./store";

export type MatchingResult = { newMatches: number; scored: number; filtered: number; aiReviews: number };

const BATCH = 2000;

/**
 * Scores every job a search has not seen yet, for every active user (or one user).
 * Only an approved master CV is ever used. Safe to re-run: a job is scored once per search.
 * With `ai` set, the best candidates then get an eligibility check, at most 20 per user per run;
 * without it (or when the AI fails) the keyword score stands.
 */
export async function runMatching(opts: { store: MatchStore; userId?: string; ai?: AIDeps | null }): Promise<MatchingResult> {
  const { store } = opts;
  const out: MatchingResult = { newMatches: 0, scored: 0, filtered: 0, aiReviews: 0 };

  for (const user of await store.listUsers(opts.userId)) {
    const skills = cvSkillSet(user.cv);
    let reviewsLeft = MAX_AI_REVIEWS_PER_SCAN;

    for (const profile of user.profiles) {
      const jobs = await store.jobsToMatch(profile.id, BATCH);
      const rows: MatchRow[] = jobs.map((job) => {
        const base = { user_id: user.userId, search_profile_id: profile.id, job_id: job.id, ai_reviewed: false };
        const r = scoreJob(job, profile, skills);
        if (r.filtered !== null) {
          out.filtered++;
          return { ...base, score: 0, matching_skills: [], missing_skills: [], reasons: [], breakdown: {}, filtered_reason: r.filtered };
        }
        if (r.score >= profile.min_match) out.newMatches++;
        return { ...base, score: r.score, matching_skills: r.matching_skills, missing_skills: r.missing_skills, reasons: r.reasons, breakdown: r.breakdown, filtered_reason: null };
      });
      out.scored += rows.length;
      if (rows.length) await store.saveMatches(rows);

      if (!opts.ai || reviewsLeft <= 0) continue;
      const candidate = candidateSummary(user.cv, { rightToWork: user.rightToWork, wantedTypes: profile.employment_types });
      for (const m of await store.matchesToReview(profile.id, Math.max(0, profile.min_match - REVIEW_MARGIN), reviewsLeft)) {
        if (reviewsLeft <= 0) break;
        reviewsLeft--;
        const review = await reviewMatch(m.job, candidate, user.userId, opts.ai);
        // AI unavailable (no key, daily limit, error): keep the keyword score and stop asking this run.
        if (!review) {
          reviewsLeft = 0;
          break;
        }
        out.aiReviews++;
        const breakdown = { ...m.breakdown, ai: review };
        const reasons = [m.breakdown.role.reason, m.breakdown.skills.reason, m.breakdown.location.reason, m.breakdown.salary.reason];
        if (review.reason) reasons.push(`AI check: ${review.reason}`);
        await store.saveReview(m.id, { score: applyReview(m.score, review, profile.min_match), breakdown, reasons, ai_reviewed: true });
      }
    }
  }
  return out;
}
