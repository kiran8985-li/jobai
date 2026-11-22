import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMasterCv } from "../cv/store";
import { normalizeProfile, type CvProfile } from "../cv/types";
import { sameJob } from "./match-url";
import { tidyPhone } from "../phone";
import { buildFillData, linksFrom } from "../fill-data";
export { tidyPhone, linksFrom };

export type ExtensionJob = { id: string; title: string; company: string; apply_url: string; status: string | null; hasCv: boolean };

/**
 * What the extension needs to fill a form for one user: their details from the approved master CV
 * (or the tailored CV for this job), their saved answers, and the jobs they can apply to.
 * Sensitive answers are never sent to the extension, whatever is stored.
 */
export async function buildExtensionPayload(db: SupabaseClient, userId: string, tabUrl: string) {
  const master = await getMasterCv(db, userId);
  if (!master) return { ready: false as const, reason: "Approve your master CV in JobPilot AI first." };

  const [{ data: matches }, { data: tailored }, { data: apps }, { data: answers }] = await Promise.all([
    db.from("matches").select("score, jobs!inner(id, title, company, apply_url)").eq("user_id", userId).is("filtered_reason", null).order("score", { ascending: false }).limit(300),
    db.from("tailored_cvs").select("job_id, content_json").eq("user_id", userId),
    db.from("applications").select("job_id, status").eq("user_id", userId),
    db.from("screening_answers").select("key, answer").eq("user_id", userId),
  ]);
  const cvByJob = new Map((tailored ?? []).map((t) => [t.job_id as string, normalizeProfile(t.content_json)]));
  const statusByJob = new Map((apps ?? []).map((a) => [a.job_id as string, a.status as string]));
  const seen = new Set<string>();
  const jobs: ExtensionJob[] = [];
  for (const m of (matches ?? []) as unknown as { jobs: { id: string; title: string; company: string; apply_url: string } }[]) {
    if (seen.has(m.jobs.id)) continue;
    seen.add(m.jobs.id);
    jobs.push({ ...m.jobs, status: statusByJob.get(m.jobs.id) ?? null, hasCv: cvByJob.has(m.jobs.id) });
  }
  const here = jobs.find((j) => j.apply_url && sameJob(tabUrl, j.apply_url)) ?? null;
  const cv: CvProfile = (here && cvByJob.get(here.id)) || master.profile;

  const saved = Object.fromEntries((answers ?? []).map((a) => [a.key as string, a.answer as string]));
  const fill = buildFillData(cv, saved, linksFrom(master.rawText));

  return {
    ready: true as const,
    job: here ? { id: here.id, title: here.title, company: here.company, status: here.status, hasCv: here.hasCv } : null,
    jobs: jobs.filter((j) => j.hasCv).slice(0, 30).map((j) => ({ id: j.id, title: j.title, company: j.company, status: j.status })),
    ...fill,
  };
}
