import "server-only";
import { AIUnavailable, chatJson, type AIDeps } from "../ai";
import type { CvProfile } from "../cv/types";
import type { Breakdown } from "./score";

export const MAX_AI_REVIEWS_PER_SCAN = 20;
/** Jobs scoring at least (minimum match − this) are worth a second opinion. */
export const REVIEW_MARGIN = 10;

const SYSTEM =
  "You check whether a candidate is eligible for a job advert. Judge only: seniority (years and level), " +
  "right to work or visa requirements stated in the advert, and contract type. Do not judge skills; that is scored separately. " +
  'Reply with one JSON object: {"eligible": true|false, "adjustment": integer from -30 to 10, "reason": "one short sentence"}. ' +
  "Use a negative adjustment when the advert clearly asks for more seniority than the candidate has, requires something they " +
  "lack, or is a different contract type. Use 0 when unsure. Never invent facts about the candidate.";

/**
 * What the AI is told about the person: level and skills only. No name, contact details or
 * employers. (The AI client also scrubs emails and phone numbers from everything sent.)
 */
export function candidateSummary(cv: CvProfile, extra: { rightToWork?: string; wantedTypes: string[] }): string {
  const lines = [
    `Headline: ${cv.headline || "not given"}`,
    `Skills: ${cv.skills.slice(0, 40).join(", ") || "not given"}`,
    "Work history (most recent first):",
    ...cv.experience.slice(0, 8).map((e) => `- ${e.title || "role"} (${e.dates || "dates not given"})`),
    ...(cv.projects.length ? [`Projects: ${cv.projects.slice(0, 8).map((p) => (p.tech ? `${p.name} (${p.tech})` : p.name)).join("; ")}`] : []),
    `Qualifications: ${cv.education.map((e) => e.degree).filter(Boolean).join("; ") || "not given"}`,
    `Right to work in the UK: ${extra.rightToWork === "yes" ? "yes" : extra.rightToWork === "yes_sponsorship" ? "needs visa sponsorship" : extra.rightToWork === "no" ? "no" : "not stated"}`,
    `Job types wanted: ${extra.wantedTypes.join(", ") || "any"}`,
  ];
  return lines.join("\n");
}

export type Review = NonNullable<Breakdown["ai"]>;

/** Asks the AI for an eligibility check. Returns null when the AI is unavailable or replies badly. */
export async function reviewMatch(
  job: { title: string; description: string; employment_type: string },
  candidate: string,
  userId: string,
  deps: AIDeps,
): Promise<Review | null> {
  try {
    const data = await chatJson(
      {
        system: SYSTEM,
        user: `CANDIDATE\n${candidate}\n\nJOB ADVERT\nTitle: ${job.title}\nType: ${job.employment_type || "not stated"}\n${job.description.slice(0, 3500)}`,
        purpose: "match_review",
        userId,
        maxTokens: 2000, // thinking models spend part of this before answering
      },
      deps,
    );
    const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    if (typeof r.eligible !== "boolean") return null;
    const n = typeof r.adjustment === "number" && Number.isFinite(r.adjustment) ? Math.round(r.adjustment) : 0;
    const reason = typeof r.reason === "string" ? r.reason.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    return { eligible: r.eligible, adjustment: Math.max(-30, Math.min(10, n)), reason };
  } catch (err) {
    if (err instanceof AIUnavailable) return null;
    throw err;
  }
}

/**
 * Applies a review to a keyword score. An "not eligible" verdict always keeps the job below
 * the user's minimum match, so it can never be applied for automatically.
 */
export function applyReview(score: number, review: Review, minMatch: number): number {
  let out = Math.max(0, Math.min(100, score + review.adjustment));
  if (!review.eligible) out = Math.min(out, Math.max(0, minMatch - 1));
  return out;
}
