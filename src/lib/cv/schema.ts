import { z } from "zod";
import { normalizeProfile, type CvProfile } from "./types";

const line = (max: number) => z.string().trim().max(max, `Keep each field under ${max} characters.`);

/** Limits for a CV saved from the review form. Stops oversized or malformed data being stored. */
const profileSchema = z.object({
  name: line(100),
  email: line(254),
  phone: line(40),
  location: line(120),
  headline: line(120),
  summary: line(2000),
  skills: z.array(line(60)).max(80, "Keep to 80 skills or fewer."),
  experience: z
    .array(
      z.object({
        title: line(120),
        company: line(120),
        dates: line(60),
        bullets: z.array(line(500)).max(25, "Keep to 25 bullets per job."),
      }),
    )
    .max(30, "Keep to 30 jobs or fewer."),
  projects: z.array(z.object({ name: line(160), tech: line(200), bullets: z.array(line(500)).max(25, "Keep to 25 bullets per project.") })).max(20, "Keep to 20 projects or fewer."),
  education: z.array(z.object({ degree: line(160), institution: line(160), dates: line(60) })).max(15),
  certifications: z.array(line(160)).max(40),
  languages: z.array(line(60)).max(20),
});

const SECTION: Record<string, string> = { experience: "Experience", projects: "Project", education: "Education", certifications: "Certification", languages: "Language", skills: "Skill" };
const FIELD: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", location: "Location", headline: "Headline", summary: "Summary", title: "job title", company: "employer", dates: "dates", bullets: "bullet point", degree: "qualification", institution: "school or university", tech: "tools" };

/** "experience.1.title" → "Experience 2, job title", so the user knows where to look. */
export function fieldName(path: PropertyKey[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const k = String(path[i]);
    const next = path[i + 1];
    if (SECTION[k] && typeof next === "number") { parts.push(`${SECTION[k]} ${next + 1}`); i++; }
    else if (k === "bullets" && typeof next === "number") { parts.push(`bullet point ${next + 1}`); i++; }
    else if (FIELD[k]) parts.push(FIELD[k]);
  }
  return parts.join(", ") || "A field";
}

export function parseProfileForm(json: string): { profile: CvProfile } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { error: "The form could not be read. Reload the page and try again." };
  }
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${fieldName(issue.path)}: ${issue.message}` : "Check the form and try again." };
  }
  return { profile: normalizeProfile(parsed.data) };
}

/** What a CV must have before it can become the master CV. */
export function approvalProblem(p: CvProfile): string | null {
  if (!p.name) return "Add your name before approving.";
  if (!p.email && !p.phone) return "Add an email address or phone number so employers can reply.";
  if (!p.experience.length && !p.skills.length) return "Add at least one job or some skills before approving.";
  return null;
}
