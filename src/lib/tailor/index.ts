import "server-only";
import { AIUnavailable, chatJson, type AIDeps } from "../ai";
import type { CvProfile } from "../cv/types";
import { reorderOnly, type JobForTailor } from "./reorder";
import { validateTailored } from "./validate";

export type Tailored = { content: CvProfile; flags: string[]; method: "ai" | "reorder" };

const SYSTEM =
  "You tailor a CV to a job advert. You may ONLY reorder, select and reword what is already in the CV. " +
  "Never add employers, job titles, dates, qualifications, skills, tools, numbers or achievements that are not in the CV. " +
  "Each bullet you return must be a rewording of ONE bullet from the SAME job entry, keeping every number exactly as written. " +
  "Use the advert's wording only where the CV bullet already supports it. " +
  "Write in British English spelling (organised, colour, centre, programme), but never change the spelling of names: " +
  "tools, products, companies, qualifications, and the skills in the skill list stay exactly as written. " +
  'Reply with one JSON object: {"summary": "2-3 sentences, at most 70 words, no name, aimed at this role, using only facts from the CV", ' +
  '"skills": ["skills from the CV skill list only, most relevant to the advert first"], ' +
  '"experience": [{"id": "E1", "bullets": ["most relevant first"]}], ' +
  '"projects": [{"id": "P1", "bullets": ["most relevant first"]}]} ' +
  "List the projects most relevant to the advert first. Keep every job and project id you were given.";

/**
 * What the AI sees: no name, contact details, employers, education or dates of birth.
 * Job entries are sent with an id, so titles, employers and dates never pass through the AI
 * and cannot be altered by it.
 */
export function tailorPrompt(master: CvProfile, job: JobForTailor): string {
  const cv = {
    headline: master.headline,
    summary: master.summary,
    skills: master.skills,
    experience: master.experience.map((e, i) => ({ id: `E${i + 1}`, title: e.title, dates: e.dates, bullets: e.bullets })),
    projects: master.projects.map((p, i) => ({ id: `P${i + 1}`, name: p.name, tech: p.tech, bullets: p.bullets })),
  };
  return `CV TO TAILOR (JSON)\n${JSON.stringify(cv)}\n\nJOB ADVERT\nTitle: ${job.title}\n${job.description.slice(0, 3500)}`;
}

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Rebuilds a full CV from the AI's reply. Unknown job ids become entries the validator will reject. */
function candidateFrom(reply: unknown, master: CvProfile): CvProfile {
  const r = (reply && typeof reply === "object" ? reply : {}) as Record<string, unknown>;
  const entries = Array.isArray(r.experience) ? r.experience : [];
  const experience = entries
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => {
      const m = master.experience[Number(/^E(\d+)$/.exec(String(e.id ?? ""))?.[1]) - 1];
      const bullets = strings(e.bullets);
      return m
        ? { title: m.title, company: m.company, dates: m.dates, bullets }
        : { title: String(e.title ?? "Unknown role"), company: String(e.company ?? e.id ?? "unknown employer"), dates: String(e.dates ?? ""), bullets };
    });
  const projects = (Array.isArray(r.projects) ? r.projects : [])
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => {
      const m = master.projects[Number(/^P(\d+)$/.exec(String(e.id ?? ""))?.[1]) - 1];
      return { name: m ? m.name : String(e.name ?? e.id ?? "unknown project"), tech: m ? m.tech : "", bullets: strings(e.bullets) };
    });
  return { ...master, summary: typeof r.summary === "string" ? r.summary : "", skills: strings(r.skills), experience, projects, education: [], certifications: [], languages: [] };
}

/**
 * Tailors the approved master CV to one job. AI first when available, then the validator;
 * reorder-only when there is no AI, the AI fails, or its output is rejected as mostly invented.
 * The result always passes the validator.
 */
export async function tailorCv(master: CvProfile, job: JobForTailor, userId: string | null, ai: AIDeps | null): Promise<Tailored> {
  const fallback = (flags: string[]): Tailored => ({ content: validateTailored(reorderOnly(master, job), master, job).cv, flags, method: "reorder" });
  if (!ai) return fallback([]);
  let reply: unknown;
  try {
    reply = await chatJson({ system: SYSTEM, user: tailorPrompt(master, job), purpose: "cv_tailor", userId, maxTokens: 12000 }, ai);
  } catch (err) {
    if (err instanceof AIUnavailable) return fallback(ai.provider ? ["The AI could not tailor this CV just now, so this version only reorders your own wording."] : []);
    throw err;
  }
  const checked = validateTailored(candidateFrom(reply, master), master, job);
  if (checked.failedBadly) {
    return fallback(["The AI's version added too much that is not on your master CV, so it was discarded. This CV only reorders your own wording.", ...checked.flags]);
  }
  return { content: checked.cv, flags: checked.flags, method: "ai" };
}
