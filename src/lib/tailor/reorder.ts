import { canonical, findSkills } from "../skills";
import type { CvProfile } from "../cv/types";
import { contentTokens } from "./validate";

export type JobForTailor = { title: string; company: string; description: string };

/**
 * Tailoring without AI: nothing is reworded. Skills the advert asks for move to the front and,
 * within each job, the bullets most relevant to the advert move up. This is the fallback
 * whenever the AI is unavailable or its output is rejected.
 */
export function reorderOnly(master: CvProfile, job: JobForTailor): CvProfile {
  const jobText = `${job.title}\n${job.description}`;
  const wanted = new Set(findSkills(jobText));
  const jobWords = new Set(contentTokens(jobText));

  const relevance = (bullet: string) =>
    findSkills(bullet).filter((s) => wanted.has(s)).length * 3 + contentTokens(bullet).filter((t) => jobWords.has(t)).length;
  const stable = <T,>(list: T[], score: (x: T) => number) =>
    list.map((x, i) => ({ x, i, s: score(x) })).sort((a, b) => b.s - a.s || a.i - b.i).map((r) => r.x);

  return {
    ...master,
    skills: stable(master.skills, (s) => (wanted.has(canonical(s)) ? 1 : 0)),
    experience: master.experience.map((e) => ({ ...e, bullets: stable(e.bullets, relevance) })),
    // Projects most relevant to the advert come first; their wording is untouched.
    projects: stable(master.projects, (p) => relevance(`${p.name} ${p.tech} ${p.bullets.join(" ")}`)).map((p) => ({ ...p, bullets: stable(p.bullets, relevance) })),
    education: master.education.map((e) => ({ ...e })),
    certifications: [...master.certifications],
    languages: [...master.languages],
  };
}
