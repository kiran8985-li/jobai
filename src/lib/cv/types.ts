import { canonical } from "../skills";

export type CvExperience = { title: string; company: string; dates: string; bullets: string[] };
export type CvEducation = { degree: string; institution: string; dates: string };

/** The structured CV. The same shape is used for the parsed CV, the master CV and tailored CVs. */
export type CvProfile = {
  name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  certifications: string[];
  languages: string[];
};

export type ParsedCv = { profile: CvProfile; parsedBy: "ai" | "heuristic"; flags: string[] };

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Forces any input (AI output, form data) into a clean CvProfile. Unknown fields are dropped. */
export function normalizeProfile(input: unknown): CvProfile {
  const p = obj(input) ?? {};
  const out: CvProfile = {
    name: str(p.name),
    email: str(p.email),
    phone: str(p.phone),
    location: str(p.location),
    headline: str(p.headline),
    summary: str(p.summary),
    skills: [],
    experience: [],
    education: [],
    certifications: strs(p.certifications),
    languages: strs(p.languages),
  };
  const seen = new Set<string>();
  for (const s of strs(p.skills)) {
    const key = canonical(s);
    if (!seen.has(key)) {
      seen.add(key);
      out.skills.push(s);
    }
  }
  for (const raw of Array.isArray(p.experience) ? p.experience : []) {
    const e = obj(raw);
    if (!e) continue;
    const item = { title: str(e.title), company: str(e.company), dates: str(e.dates), bullets: strs(e.bullets) };
    if (item.title || item.company) out.experience.push(item);
  }
  for (const raw of Array.isArray(p.education) ? p.education : []) {
    const e = obj(raw);
    if (!e) continue;
    const item = { degree: str(e.degree), institution: str(e.institution), dates: str(e.dates) };
    if (item.degree || item.institution) out.education.push(item);
  }
  return out;
}
