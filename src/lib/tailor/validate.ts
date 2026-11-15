import { canonical, findSkills } from "../skills";
import type { CvExperience, CvProfile } from "../cv/types";

/**
 * Rule 1, enforced in code: a tailored CV may only reorder, select and reword facts from the
 * approved master CV. Whatever produced the candidate (the AI, or anything else), this decides
 * what survives. Anything that cannot be traced to the master is dropped and flagged.
 */

export type JobContext = { title: string; company: string };
export type Validated = {
  cv: CvProfile;
  flags: string[];
  /** True when so much was invented that the whole candidate should be thrown away. */
  failedBadly: boolean;
};

const STOP = new Set(
  "a an and the of to in on for with by at from as is are was were be been it its this that these those or our my i we you your their his her into over across per via using used use within while which who whom than then so such also both each more most very".split(" "),
);
// Filler a summary may add without claiming anything.
const SUMMARY_FILLER = new Set(
  "seeking seek looking look keen eager role position opportunity experience experienced experiences skilled skill skills strong proven background track record professional bring bringing brings team teams work working worked focus focused focusing passionate motivated ability able years year expertise including include building build delivering deliver delivered deliver high quality solid hands candidate join joining contribute contributing well suited fit now currently recent recently developer engineer analyst".split(" "),
);

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const stem = (w: string) => (w.length > 5 ? w.replace(/(ing|ed|es|s)$/, "") : w.length > 3 ? w.replace(/s$/, "") : w);
/** Meaningful words of a text, lightly stemmed, without stop words. */
export const contentTokens = (s: string) =>
  (s.toLowerCase().match(/[a-z][a-z+#.'-]*[a-z+#]|[a-z]/g) ?? []).map((w) => w.replace(/['.-]+$/g, "")).filter((w) => !STOP.has(w)).map(stem);
/** Every figure in a text: "30%", "2", "2.5", "£40k", "3.12". */
export const numbers = (s: string) => (s.toLowerCase().match(/\d+(?:[.,]\d+)*\s?(?:%|k\b|m\b|bn\b)?/g) ?? []).map((n) => n.replace(/[\s,]/g, ""));

const BULLET_THRESHOLD = 0.6;
const SUMMARY_THRESHOLD = 0.75;

/** Is `candidate` a fair rewording of `master`? Same figures, no new skills, mostly the same words. */
export function bulletSupportedBy(candidate: string, master: string): boolean {
  const masterNums = new Set(numbers(master));
  if (numbers(candidate).some((n) => !masterNums.has(n))) return false;
  const masterSkills = new Set(findSkills(master));
  if (findSkills(candidate).some((s) => !masterSkills.has(s))) return false;
  const cand = contentTokens(candidate);
  if (cand.length === 0) return false;
  const have = new Set(contentTokens(master));
  return cand.filter((t) => have.has(t)).length / cand.length >= BULLET_THRESHOLD;
}

const sameEntry = (a: CvExperience, b: CvExperience) =>
  squash(a.title) === squash(b.title) && squash(a.company) === squash(b.company) && squash(a.dates) === squash(b.dates);
const short = (s: string) => (s.length > 90 ? s.slice(0, 87) + "..." : s);

export function validateTailored(candidate: CvProfile, master: CvProfile, job: JobContext): Validated {
  const flags: string[] = [];
  let bulletsSeen = 0;
  let bulletsRejected = 0;
  let inventedEntries = 0;

  // --- experience: the master's entries, in the master's order, with only supported bullets.
  for (const entry of candidate.experience) {
    if (!master.experience.some((m) => sameEntry(m, entry))) {
      inventedEntries++;
      flags.push(`Removed a job that is not on your master CV: ${short(`${entry.title} at ${entry.company} (${entry.dates})`)}`);
    }
  }
  const experience = master.experience.map((m) => {
    const cand = candidate.experience.find((c) => sameEntry(m, c));
    const used = new Set<number>();
    const bullets: string[] = [];
    for (const raw of cand?.bullets ?? []) {
      const bullet = raw.replace(/\s+/g, " ").trim();
      if (!bullet) continue;
      bulletsSeen++;
      // Each master bullet can back one tailored bullet, and only from the same job.
      const i = m.bullets.findIndex((mb, idx) => !used.has(idx) && bulletSupportedBy(bullet, mb));
      if (i === -1) {
        bulletsRejected++;
        flags.push(`Removed a bullet your master CV does not support: ${short(bullet)}`);
        continue;
      }
      used.add(i);
      bullets.push(bullet);
    }
    // Nothing usable for this job: keep the master's own bullets rather than an empty entry.
    return { title: m.title, company: m.company, dates: m.dates, bullets: bullets.length ? bullets : [...m.bullets] };
  });

  // --- skills: only skills on the master, in the master's spelling; the rest follow in master order.
  const masterByKey = new Map(master.skills.map((s) => [canonical(s), s]));
  const skills: string[] = [];
  let skillsRejected = 0;
  for (const s of candidate.skills) {
    const hit = masterByKey.get(canonical(s));
    if (!hit) {
      skillsRejected++;
      flags.push(`Removed a skill that is not on your master CV: ${short(s)}`);
    } else if (!skills.includes(hit)) skills.push(hit);
  }
  for (const s of master.skills) if (!skills.includes(s)) skills.push(s);

  // --- summary: free text, so checked hardest. On any doubt the master's summary is used.
  let summary = candidate.summary.replace(/\s+/g, " ").trim().slice(0, 700);
  if (summary && squash(summary) !== squash(master.summary)) {
    const problem = summaryProblem(summary, master, job);
    if (problem) {
      flags.push(`Kept your original summary: the rewritten one ${problem}.`);
      summary = master.summary;
    }
  }
  if (!summary) summary = master.summary;

  // --- everything else is copied from the master, whatever the candidate said.
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  if (candidate.education.length && differs(candidate.education, master.education)) flags.push("Ignored changes to your education: it always matches your master CV.");
  if (candidate.certifications.length && differs(candidate.certifications, master.certifications)) flags.push("Ignored changes to your certifications: they always match your master CV.");

  const cv: CvProfile = {
    name: master.name,
    email: master.email,
    phone: master.phone,
    location: master.location,
    headline: master.headline,
    summary,
    skills,
    experience,
    education: master.education.map((e) => ({ ...e })),
    certifications: [...master.certifications],
    languages: [...master.languages],
  };
  const failedBadly =
    inventedEntries > 0 ||
    (bulletsSeen > 0 && bulletsRejected / bulletsSeen > 0.5) ||
    (candidate.skills.length > 0 && skillsRejected / candidate.skills.length > 0.5);
  return { cv, flags, failedBadly };
}

/** Why a rewritten summary cannot be used, or null when it is fine. */
function summaryProblem(summary: string, master: CvProfile, job: JobContext): string | null {
  const masterText = [master.headline, master.summary, ...master.skills, ...master.certifications, ...master.education.flatMap((e) => [e.degree, e.institution]), ...master.experience.flatMap((e) => [e.title, e.company, ...e.bullets])].join("\n");
  const masterNums = new Set(numbers(masterText));
  const badNumber = numbers(summary).find((n) => !masterNums.has(n));
  if (badNumber) return `contained a figure that is not on your CV (${badNumber})`;

  const masterSkills = new Set([...master.skills.map(canonical), ...findSkills(masterText)]);
  // Naming the job or the employer being applied to ("...role at Larkfield Logistics") is not a
  // skill claim, so those exact phrases are set aside before looking for skills.
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = [job.title, job.company].map((t) => t.trim()).filter(Boolean).map(escape);
  const claims = named.length ? summary.replace(new RegExp(named.join("|"), "gi"), " ") : summary;
  const badSkill = findSkills(claims).find((s) => !masterSkills.has(s));
  if (badSkill) return `mentioned a skill that is not on your CV (${badSkill})`;

  const allowed = new Set([...contentTokens(masterText), ...contentTokens(`${job.title} ${job.company}`), ...[...SUMMARY_FILLER].map(stem)]);
  const tokens = contentTokens(summary);
  if (!tokens.length) return "was empty";
  const known = tokens.filter((t) => allowed.has(t)).length / tokens.length;
  if (known < SUMMARY_THRESHOLD) return "said things your CV does not";
  return null;
}
