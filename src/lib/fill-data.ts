import type { CvProfile } from "./cv/types";
import { tidyPhone } from "./phone";
import { CUSTOM_PREFIX, STANDARD_QUESTIONS, isSensitiveQuestion } from "./screening";

/**
 * What a form filler (the browser add-on or the apply robot) gets for one person: their details from
 * their CV and their saved answers. Sensitive answers are never included, whatever is stored. No I/O.
 */

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

export type FillAnswer = { key: string; question: string; answer: string; value?: string };
export type FillData = { person: Record<string, unknown>; answers: FillAnswer[] };

export function buildFillData(cv: CvProfile, saved: Record<string, string>, links: { linkedin: string; github: string; website: string }): FillData {
  const parts = cv.name.trim().split(/\s+/);
  const standard = STANDARD_QUESTIONS.filter((q) => saved[q.key]).map((q) => ({ key: q.key, question: q.label, value: saved[q.key], answer: VALUE_LABELS[q.key]?.[saved[q.key]] ?? saved[q.key] }));
  const custom = Object.entries(saved)
    .filter(([k]) => k.startsWith(CUSTOM_PREFIX) && !isSensitiveQuestion(k))
    .map(([k, v]) => ({ key: "custom", question: k.slice(CUSTOM_PREFIX.length), answer: v }));
  const current = cv.experience[0];
  return {
    person: {
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
      fullName: cv.name,
      email: cv.email,
      phone: tidyPhone(cv.phone),
      location: cv.location || saved.current_location || "",
      ...links,
      currentTitle: current?.title ?? "",
      currentCompany: current?.company ?? "",
      headline: cv.headline,
      summary: cv.summary,
      skills: cv.skills.join(", "),
      experience: cv.experience.map((e) => ({ title: e.title, company: e.company, dates: e.dates })),
      education: cv.education.map((e) => ({ degree: e.degree, school: e.institution, dates: e.dates })),
    },
    // True for every JobPilot user, so it is never a guess.
    answers: [...standard, ...custom, { key: "heard_about", question: "How did you hear about this job?", answer: "Online job search" }],
  };
}
