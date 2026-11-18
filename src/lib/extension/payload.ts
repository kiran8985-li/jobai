import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMasterCv } from "../cv/store";
import { normalizeProfile, type CvProfile } from "../cv/types";
import { CUSTOM_PREFIX, STANDARD_QUESTIONS, isSensitiveQuestion } from "../screening";
import { sameJob } from "./match-url";
import { tidyPhone } from "../phone";
export { tidyPhone };

export type ExtensionJob = { id: string; title: string; company: string; apply_url: string; status: string | null; hasCv: boolean };

const LINK = {
  linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?|(?<![\w.])linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i,
  github: /https?:\/\/github\.com\/[A-Za-z0-9-]+\/?|(?<![\w.])github\.com\/[A-Za-z0-9-]+\/?/i,
  website: /https?:\/\/(?!(?:[a-z]{2,3}\.)?linkedin\.com|github\.com)[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i,
};
const withScheme = (u: string | undefined) => (u ? (u.startsWith("http") ? u : `https://${u}`) : "");

/** Links written in the user's own CV (they are not part of the structured profile). */
export function linksFrom(rawText: string) {
  return { linkedin: withScheme(LINK.linkedin.exec(rawText)?.[0]), github: withScheme(LINK.github.exec(rawText)?.[0]), website: LINK.website.exec(rawText)?.[0] ?? "" };
}

const VALUE_LABELS: Record<string, Record<string, string>> = {
  right_to_work_uk: { yes: "Yes", yes_sponsorship: "Yes, but I will need visa sponsorship", no: "No" },
  willing_to_relocate: { yes: "Yes", no: "No" },
};

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

  const parts = cv.name.trim().split(/\s+/);
  const saved = Object.fromEntries((answers ?? []).map((a) => [a.key as string, a.answer as string]));
  const standard = STANDARD_QUESTIONS.filter((q) => saved[q.key]).map((q) => ({ key: q.key, question: q.label, value: saved[q.key], answer: VALUE_LABELS[q.key]?.[saved[q.key]] ?? saved[q.key] }));
  const custom = Object.entries(saved)
    .filter(([k]) => k.startsWith(CUSTOM_PREFIX) && !isSensitiveQuestion(k))
    .map(([k, v]) => ({ key: "custom", question: k.slice(CUSTOM_PREFIX.length), answer: v }));
  const current = cv.experience[0];

  return {
    ready: true as const,
    job: here ? { id: here.id, title: here.title, company: here.company, status: here.status, hasCv: here.hasCv } : null,
    jobs: jobs.filter((j) => j.hasCv).slice(0, 30).map((j) => ({ id: j.id, title: j.title, company: j.company, status: j.status })),
    person: {
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
      fullName: cv.name,
      email: cv.email,
      phone: tidyPhone(cv.phone),
      location: cv.location || saved.current_location || "",
      ...linksFrom(master.rawText),
      currentTitle: current?.title ?? "",
      currentCompany: current?.company ?? "",
      headline: cv.headline,
      summary: cv.summary,
      skills: cv.skills.join(", "),
      experience: cv.experience.map((e) => ({ title: e.title, company: e.company, dates: e.dates })),
      education: cv.education.map((e) => ({ degree: e.degree, school: e.institution, dates: e.dates })),
    },
    answers: [...standard, ...custom],
  };
}
