import type { CvProfile } from "../cv/types";
import { cvFilename } from "../render/layout";
import type { Answered } from "./questions";
import { tidyPhone } from "../phone";

export type ApplicationEmail = {
  to: string;
  subject: string;
  body: string;
  /** Replies go straight to the applicant, not to JobPilot AI. */
  replyTo: string;
  attachmentName: string;
};

// Reserved test domains (RFC 2606 / 6761). The demo jobs use them. Nothing is ever sent there.
const RESERVED = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$/i;
export const isReservedAddress = (email: string) => RESERVED.test(email.split("@").pop() ?? "");

const firstSentences = (text: string, max: number) => {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+/g) ?? [text.trim()];
  let out = "";
  for (const p of parts) {
    if ((out + p).length > max) break;
    out += p;
  }
  return (out || text.slice(0, max)).trim();
};

/**
 * The application email: a short cover note built ONLY from the tailored CV (which has passed the
 * fact check), the user's own contact details, and their saved answers. No AI writes this, so it
 * cannot claim anything the CV does not.
 */
export function buildApplicationEmail(cv: CvProfile, job: { title: string; company: string; apply_email: string }, answers: Answered[]): ApplicationEmail {
  const company = job.company || "your company";
  const lines = [
    "Dear Hiring Team,",
    "",
    `I would like to apply for the ${job.title} role at ${company}.`,
    "",
    ...(cv.summary ? [firstSentences(cv.summary, 420), ""] : []),
    "My CV is attached.",
    ...(answers.length ? ["", "For your information:", ...answers.map((a) => `- ${a.question}: ${a.answer}`)] : []),
    "",
    "I would welcome the chance to discuss the role. Thank you for your time.",
    "",
    "Kind regards,",
    cv.name,
    ...[tidyPhone(cv.phone), cv.email].filter(Boolean),
  ];
  return {
    to: job.apply_email,
    subject: `Application for ${job.title} - ${cv.name}`.replace(/[\r\n]+/g, " ").slice(0, 200),
    body: lines.join("\n"),
    replyTo: cv.email,
    attachmentName: cvFilename(cv, "pdf", job.company),
  };
}
