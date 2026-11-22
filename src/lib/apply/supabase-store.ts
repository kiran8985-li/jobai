import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProfile } from "../cv/types";
import { linksFrom } from "../fill-data";
import type { ApplyCandidate, ApplyJob, ApplyProfile, ApplyStore, ApplyUser } from "./store";

const must = <T>(res: { data: T; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data;
};
const AUTO = ["prepared", "dry_run", "sent", "failed"];

/** The apply engine's database access. `db` must be the service-role client: users cannot write applications. */
export function supabaseApplyStore(db: SupabaseClient): ApplyStore {
  return {
    async listUsers(userId) {
      let uq = db.from("profiles_user").select("id, auto_apply_paused").eq("is_active", true);
      if (userId) uq = uq.eq("id", userId);
      const people = must(await uq) ?? [];
      const out: ApplyUser[] = [];
      for (const person of people) {
        const uid = person.id as string;
        const [profiles, answers, matches, tailored, applied, master] = await Promise.all([
          db.from("search_profiles").select("id, name, min_match, daily_limit, auto_apply, consent_at, is_active").eq("user_id", uid),
          db.from("screening_answers").select("key, answer").eq("user_id", uid),
          db.from("matches").select("search_profile_id, score, jobs!inner(id, title, company, apply_url, apply_email, apply_method, questions)").eq("user_id", uid).is("filtered_reason", null).order("score", { ascending: false }).limit(1000),
          db.from("tailored_cvs").select("job_id, content_json, pdf_path").eq("user_id", uid),
          db.from("applications").select("job_id").eq("user_id", uid),
          db.from("cvs").select("raw_text").eq("user_id", uid).eq("approved", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        const profileList = (must(profiles) ?? []) as ApplyProfile[];
        const byId = new Map(profileList.map((p) => [p.id, p]));
        const cvByJob = new Map((must(tailored) ?? []).map((t) => [t.job_id as string, t]));
        const done = new Set((must(applied) ?? []).map((a) => a.job_id as string));
        const seen = new Set<string>();
        const candidates: ApplyCandidate[] = [];
        for (const m of (must(matches) ?? []) as unknown as { search_profile_id: string; score: number; jobs: ApplyJob & { questions: unknown } }[]) {
          const profile = byId.get(m.search_profile_id);
          const cv = cvByJob.get(m.jobs.id);
          // Best-scoring search wins when one job matches two searches.
          if (!profile || !profile.is_active || m.score < profile.min_match || !cv || done.has(m.jobs.id) || seen.has(m.jobs.id)) continue;
          seen.add(m.jobs.id);
          candidates.push({
            profileId: profile.id,
            score: m.score,
            job: { ...m.jobs, questions: Array.isArray(m.jobs.questions) ? m.jobs.questions.filter((q): q is string => typeof q === "string") : [] },
            tailored: { content: normalizeProfile(cv.content_json), pdf_path: (cv.pdf_path as string | null) ?? null },
          });
        }
        if (!candidates.length) continue;
        out.push({
          userId: uid,
          paused: person.auto_apply_paused === true,
          links: linksFrom((master.data?.raw_text as string | undefined) ?? ""),
          answers: Object.fromEntries((must(answers) ?? []).map((a) => [a.key as string, a.answer as string])),
          profiles: profileList,
          candidates,
        });
      }
      return out;
    },
    async countAutoSince(profileId, sinceIso) {
      const { count, error } = await db.from("applications").select("id", { count: "exact", head: true }).eq("search_profile_id", profileId).in("status", AUTO).gte("created_at", sinceIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async insertApplication(app) {
      const { data, error } = await db.from("applications").insert(app).select("id").single();
      // 23505 = the one-application-per-user-per-job rule: someone (or an earlier run) got there first.
      if (error?.code === "23505") return null;
      if (error) throw new Error(error.message);
      return data!.id as string;
    },
    async updateApplication(id, patch) {
      must(await db.from("applications").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
    },
    async addNotification(n) {
      must(await db.from("notifications").insert(n));
    },
    async saveScreenshot(userId, applicationId, png) {
      const path = `${userId}/robot/${applicationId}.png`;
      const { error } = await db.storage.from("tailored").upload(path, png, { contentType: "image/png", upsert: true });
      return error ? null : path;
    },
    async readTailoredPdf(path) {
      const { data, error } = await db.storage.from("tailored").download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
