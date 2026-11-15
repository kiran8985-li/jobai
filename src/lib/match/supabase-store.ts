import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProfile } from "../cv/types";
import type { Breakdown } from "./score";
import type { JobRow, MatchStore, MatchUser, ReviewCandidate } from "./store";

const must = <T>(res: { data: T; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data;
};
const JOB = "id, title, description, location, salary_min, salary_max, employment_type";

/** Matching's database access. `db` must be the service-role client: users cannot write matches. */
export function supabaseMatchStore(db: SupabaseClient): MatchStore {
  return {
    async listUsers(userId) {
      let uq = db.from("profiles_user").select("id").eq("is_active", true);
      if (userId) uq = uq.eq("id", userId);
      const ids = (must(await uq) ?? []).map((u) => u.id as string);
      if (!ids.length) return [];
      const [cvs, profiles, answers] = await Promise.all([
        // approved = true is the rule: an unapproved CV is never used for matching.
        db.from("cvs").select("user_id, profile_json").eq("approved", true).in("user_id", ids),
        db.from("search_profiles").select("id, user_id, roles, locations, min_salary, employment_types, keywords, exclude_keywords, min_match").eq("is_active", true).in("user_id", ids).order("created_at"),
        db.from("screening_answers").select("user_id, answer").eq("key", "right_to_work_uk").in("user_id", ids),
      ]);
      const users: MatchUser[] = [];
      for (const cv of must(cvs) ?? []) {
        const mine = (must(profiles) ?? []).filter((p) => p.user_id === cv.user_id);
        if (!mine.length) continue;
        users.push({
          userId: cv.user_id as string,
          cv: normalizeProfile(cv.profile_json),
          rightToWork: (must(answers) ?? []).find((a) => a.user_id === cv.user_id)?.answer as string | undefined,
          profiles: mine as unknown as MatchUser["profiles"],
        });
      }
      return users;
    },
    async jobsToMatch(profileId, limit) {
      return (must(await db.rpc("jobs_to_match", { p_profile: profileId, p_limit: limit }).select(JOB)) ?? []) as unknown as JobRow[];
    },
    async saveMatches(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        must(await db.from("matches").upsert(rows.slice(i, i + 200), { onConflict: "search_profile_id,job_id", ignoreDuplicates: true }));
      }
    },
    async matchesToReview(profileId, minScore, limit) {
      const data = must(
        await db
          .from("matches")
          .select(`id, score, breakdown, jobs!inner(${JOB})`)
          .eq("search_profile_id", profileId)
          .eq("ai_reviewed", false)
          .is("filtered_reason", null)
          .gte("score", minScore)
          .order("score", { ascending: false })
          .limit(limit),
      );
      return (data ?? []).map((r) => ({ id: r.id as string, score: r.score as number, breakdown: r.breakdown as Breakdown, job: r.jobs as unknown as JobRow })) as ReviewCandidate[];
    },
    async saveReview(matchId, patch) {
      must(await db.from("matches").update(patch).eq("id", matchId));
    },
  };
}
