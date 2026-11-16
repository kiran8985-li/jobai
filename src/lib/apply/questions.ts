import { CUSTOM_PREFIX, isSensitiveQuestion } from "../screening";

/**
 * Rule 3, "skip, don't guess": an application is only sent automatically when every question the
 * job asks has an answer the user saved in advance, and none of them is sensitive.
 */

export type Answered = { question: string; answer: string };
export type QuestionCheck =
  | { ok: true; answers: Answered[] }
  | { ok: false; kind: "sensitive" | "unanswered"; reason: string; questions: string[]; answers: Answered[] };

const LABELS: Record<string, string> = {
  right_to_work_uk: "Right to work in the UK",
  notice_period: "Notice period",
  salary_expectation: "Salary expectation",
  willing_to_relocate: "Willing to relocate",
};
const VALUES: Record<string, Record<string, string>> = {
  right_to_work_uk: { yes: "Yes", yes_sponsorship: "Yes, with visa sponsorship", no: "No" },
  willing_to_relocate: { yes: "Yes", no: "No" },
};

const plain = (q: string) => q.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
const key = (q: string) => plain(q).toLowerCase().replace(/[^a-z0-9 ]/g, "");

/** Which saved answer, if any, a job's question refers to. */
function standardKey(question: string): string | null {
  const q = key(question);
  if (/right to work|work in the uk|eligible to work|work permit|visa|sponsorship/.test(q)) return "right_to_work_uk";
  if (/notice period|notice/.test(q)) return "notice_period";
  if (/salary|pay expectation|expected pay|compensation expectation/.test(q)) return "salary_expectation";
  if (/relocat/.test(q)) return "willing_to_relocate";
  return null;
}

export function readable(question: string): string {
  const k = standardKey(question);
  if (k && key(question).split(" ").length <= 4) return LABELS[k];
  const p = plain(question);
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Checks a job's questions against the user's saved answers (`screening_answers` rows as key → answer). */
export function checkQuestions(questions: string[], saved: Record<string, string>): QuestionCheck {
  const asked = questions.map((q) => q.trim()).filter(Boolean);
  const answers: Answered[] = [];
  const sensitive: string[] = [];
  const unanswered: string[] = [];
  const custom = new Map(Object.entries(saved).filter(([k]) => k.startsWith(CUSTOM_PREFIX)).map(([k, v]) => [key(k.slice(CUSTOM_PREFIX.length)), v]));

  for (const q of asked) {
    // Sensitive questions are never answered, even if something that looks like an answer exists.
    if (isSensitiveQuestion(plain(q))) {
      sensitive.push(readable(q));
      continue;
    }
    const k = standardKey(q);
    const raw = (k ? saved[k] : undefined) ?? custom.get(key(q));
    if (!raw || !raw.trim()) {
      unanswered.push(readable(q));
      continue;
    }
    answers.push({ question: readable(q), answer: (k && VALUES[k]?.[raw]) || raw });
  }

  if (sensitive.length) {
    return { ok: false, kind: "sensitive", questions: sensitive, answers, reason: `This job asks a sensitive question (${sensitive.join("; ")}). JobPilot AI never answers these, so it was not applied for automatically.` };
  }
  if (unanswered.length) {
    return { ok: false, kind: "unanswered", questions: unanswered, answers, reason: `This job asks something you have not answered yet (${unanswered.join("; ")}). Add the answer in Auto-apply settings, then try again.` };
  }
  return { ok: true, answers };
}
