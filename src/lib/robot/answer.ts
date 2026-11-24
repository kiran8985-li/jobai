import type { AIDeps } from "../ai";
import type { CvProfile } from "../cv/types";
import { CUSTOM_PREFIX, isSensitiveQuestion } from "../screening";

/**
 * Answers an application-form question that no saved answer covers, using ONLY facts from the
 * person's CV and saved answers. Returns null when the facts do not answer it: the robot then hands
 * the job back to the person instead of guessing.
 */

// Sensitive topics matched loosely too ("Genderselect…" when a label runs into its options).
export const SENSITIVE_LOOSE = /gender|sex|ethnic|race|racial|disab|religio|faith|belief|sexual|orientation|health|medical|pregnan|criminal|convict|veteran|marital|trade union|political|neurodiver/i;
// Never the AI's to answer: tick boxes, links and agreements.
const NOT_FOR_AI = /\bschool\b|\bdegree\b|discipline|university|i (have read|agree|consent|confirm|accept|acknowledge)|terms|privacy|url\b|website|link(edin)?\b|github|portfolio|twitter|signature/i;

// Facts that must come from the person, never be worked out: they are left for saved answers.
const PERSONAL = /country|location|\bcity\b|town|where (do )?you live|nationality|phone|email|salary|pay|compensation|notice|right to work|visa|sponsor|licen[cs]e|relocat|start date|available|availability|citizen|criminal|convict|address|postcode|date of birth|\bage\b|referee|reference/i;

/** The CV as plain facts, without name, email, phone or address (they never go to the AI). */
export function candidateFacts(cv: CvProfile, saved: Record<string, string>): string {
  const lines: string[] = [];
  if (cv.headline) lines.push(`Headline: ${cv.headline}`);
  if (cv.summary) lines.push(`Summary: ${cv.summary}`);
  if (cv.skills.length) lines.push(`Skills: ${cv.skills.join(", ")}`);
  for (const e of cv.experience) lines.push(`Job: ${e.title} at ${e.company} (${e.dates})${e.bullets.length ? `\n  - ${e.bullets.join("\n  - ")}` : ""}`);
  for (const p of cv.projects ?? []) lines.push(`Project: ${p.name}${p.tech ? ` (${p.tech})` : ""}${p.bullets.length ? `\n  - ${p.bullets.join("\n  - ")}` : ""}`);
  for (const ed of cv.education) lines.push(`Education: ${ed.degree}, ${ed.institution} (${ed.dates})`);
  if (cv.certifications.length) lines.push(`Certifications: ${cv.certifications.join(", ")}`);
  if (cv.languages.length) lines.push(`Languages: ${cv.languages.join(", ")}`);
  for (const [k, v] of Object.entries(saved)) {
    if (k.startsWith(CUSTOM_PREFIX) && !isSensitiveQuestion(k)) lines.push(`Saved answer: "${k.slice(CUSTOM_PREFIX.length)}" → ${v}`);
  }
  return lines.join("\n");
}

const SYSTEM = `You help a job candidate fill in an application form.
Answer the QUESTION using ONLY the facts in CANDIDATE. Do not invent or estimate anything: no employers, dates, numbers, years of experience, qualifications, tools or achievements that are not written in CANDIDATE.
If CANDIDATE does not clearly answer the question, return {"answer": null}.
Write in British English, first person, plain and professional. Short questions get a short answer (a few words or one sentence). Questions asking to describe or explain get at most 120 words.
Return only JSON: {"answer": string | null}.`;

/** Every number in the answer must appear in the facts (stops made-up figures). */
export function numbersBacked(answer: string, facts: string): boolean {
  const nums = answer.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return nums.every((n) => facts.includes(n));
}

export function makeAnswerer(userId: string, cv: CvProfile, saved: Record<string, string>, deps?: AIDeps) {
  const facts = candidateFacts(cv, saved);
  return async (question: string, options?: string[]): Promise<string | null> => {
    const q = question.trim().slice(0, 400);
    if (!q || isSensitiveQuestion(q) || SENSITIVE_LOOSE.test(q) || PERSONAL.test(q) || NOT_FOR_AI.test(q)) return null;
    const { chatJson } = await import("../ai");
    try {
      const choices = (options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 60);
      const ask = choices.length
        ? `QUESTION: ${q}\nOPTIONS (the answer must be exactly one of these, copied word for word, or null):\n- ${choices.join("\n- ")}`
        : `QUESTION: ${q}`;
      const reply = (await chatJson({ system: SYSTEM, user: `CANDIDATE:\n${facts}\n\n${ask}`, purpose: "form_answer", userId, maxTokens: 1500 }, deps)) as { answer?: unknown };
      const a = typeof reply?.answer === "string" ? reply.answer.trim() : "";
      if (!a || a.length > 1500 || !numbersBacked(a, facts)) return null;
      // A dropdown answer must be one of its options.
      if (choices.length && !choices.includes(a)) return null;
      return a;
    } catch {
      return null;
    }
  };
}
