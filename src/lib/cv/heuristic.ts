import { canonical, findSkills } from "../skills";
import { normalizeProfile, type CvExperience, type CvProfile } from "./types";

/** Non-AI CV parser: the fallback when the AI is off, over its limit, or fails. */

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
export const PHONE_RE = /(?:\+44\s?\(?0?\)?|\(?0)\d[\d\s().-]{8,13}\d/;
const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE = `(?:${MONTH}\\.?\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const DATE_RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|Present|Current|Now|Ongoing)`, "i");
const BULLET_RE = /^\s*(?:[-•*▪●◦‣·]|\d+[.)])\s+/;

const SECTION_HEADINGS: Record<string, string[]> = {
  summary: ["summary", "profile", "personal statement", "about me", "professional summary", "career objective", "objective"],
  experience: ["experience", "work experience", "employment", "employment history", "work history", "professional experience", "career history"],
  education: ["education", "qualifications", "education and qualifications", "academic background"],
  skills: ["skills", "technical skills", "key skills", "core skills", "skills and tools", "competencies", "technologies"],
  certifications: ["certifications", "certificates", "training", "courses", "licences", "licenses"],
  languages: ["languages"],
  projects: ["projects", "personal projects"],
  interests: ["interests", "hobbies", "references"],
};

function strip(s: string, chars: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

function headingOf(line: string): string | null {
  const clean = line.replace(/[^A-Za-z& ]/g, "").trim().toLowerCase().replace(/&/g, "and");
  if (!clean || clean.length > 40) return null;
  for (const [key, names] of Object.entries(SECTION_HEADINGS)) if (names.includes(clean)) return key;
  return null;
}

/** True when the line is a section heading such as "Experience" or "Key Skills". */
export function isSectionHeading(line: string): boolean {
  return Boolean(line.trim()) && !BULLET_RE.test(line) && headingOf(line) !== null;
}

function splitSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = { header: [] };
  let current = "header";
  for (const line of lines) {
    const h = line.trim() && !BULLET_RE.test(line) ? headingOf(line) : null;
    if (h) {
      current = h;
      sections[current] ??= [];
      continue;
    }
    (sections[current] ??= []).push(line);
  }
  return sections;
}

function splitTitleCompany(text: string): [string, string] {
  const t = strip(text, " ,|-–—\t");
  for (const sep of [" at ", " | ", " - ", " – ", " — ", ", ", " @ "]) {
    const i = t.indexOf(sep);
    if (i !== -1) return [t.slice(0, i).trim(), t.slice(i + sep.length).trim()];
  }
  return [t, ""];
}

const startsLower = (s: string) => {
  const c = s.charAt(0);
  return c !== "" && c === c.toLowerCase() && c !== c.toUpperCase();
};

function parseExperience(lines: string[]): CvExperience[] {
  const entries: CvExperience[] = [];
  let current: CvExperience | null = null;
  let buffer: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const dm = DATE_RANGE_RE.exec(line);
    if (BULLET_RE.test(line)) {
      if (!current) {
        current = { title: "", company: "", dates: "", bullets: [] };
        entries.push(current);
      }
      current.bullets.push(line.replace(BULLET_RE, "").trim());
      continue;
    }
    if (dm) {
      const rest = strip(line.slice(0, dm.index) + " " + line.slice(dm.index + dm[0].length), " ,|-–—()\t");
      const head = [...buffer.filter(Boolean), ...(rest ? [rest] : [])];
      buffer = [];
      let title = "";
      let company = "";
      if (head.length >= 2) {
        title = head[head.length - 2];
        company = head[head.length - 1];
        // The company line may come first; swap when the first looks like a company.
        if (/\b(ltd|limited|plc|inc|llc|group|council|nhs|university|bank)\b/i.test(title)) {
          [title, company] = [company, title];
        }
      } else if (head.length === 1) {
        [title, company] = splitTitleCompany(head[0]);
      }
      current = { title, company, dates: dm[0].trim(), bullets: [] };
      entries.push(current);
    } else if (current && current.bullets.length && startsLower(line)) {
      // A wrapped bullet continues on the next line.
      current.bullets[current.bullets.length - 1] += " " + line;
    } else {
      buffer.push(line);
      buffer = buffer.slice(-2);
      if (current && current.bullets.length) current = null;
    }
  }
  return entries;
}

function parseEducation(lines: string[]) {
  const out: { degree: string; institution: string; dates: string }[] = [];
  for (const raw of lines) {
    let line = raw.replace(BULLET_RE, "").trim();
    if (!line) continue;
    const dm = DATE_RANGE_RE.exec(line);
    let dates = dm ? dm[0] : "";
    if (dm) {
      line = strip(line.slice(0, dm.index) + " " + line.slice(dm.index + dm[0].length), " ,|-–—()");
    } else {
      const ym = /\b(19|20)\d{2}\b/.exec(line);
      if (ym) {
        dates = ym[0];
        line = strip(line.slice(0, ym.index) + line.slice(ym.index + ym[0].length), " ,|-–—()");
      }
    }
    const parts = line.split(/\s*[|,–—]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const institution = parts.find((p) => /universit|college|school|institute|academy/i.test(p)) ?? "";
    const degree = parts.filter((p) => p !== institution).join(", ");
    if (degree || institution) out.push({ degree, institution, dates });
  }
  return out;
}

function parseList(lines: string[]): string[] {
  const items: string[] = [];
  for (const raw of lines) {
    let line = raw.replace(BULLET_RE, "").trim();
    const colon = line.indexOf(":");
    if (colon !== -1 && colon < 30) line = line.slice(colon + 1);
    for (const piece of line.split(/[,;|•·]/)) {
      const part = strip(piece, " .");
      if (part && part.length < 60) items.push(part);
    }
  }
  return items;
}

export function heuristicParse(text: string): CvProfile {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const sections = splitSections(lines);
  const header = (sections.header ?? []).map((l) => l.trim()).filter(Boolean);
  const email = EMAIL_RE.exec(text)?.[0] ?? "";
  const phone = PHONE_RE.exec(text)?.[0].trim() ?? "";

  let name = "";
  for (const l of header.slice(0, 4)) {
    const words = l.split(/\s+/).length;
    if (!l.includes("@") && !/\d{3}/.test(l) && words >= 2 && words <= 5) {
      name = l;
      break;
    }
  }
  const location = /(?:Location|Address)\s*[:\-]\s*(.+)/i.exec(text)?.[1].trim() ?? "";
  let headline = "";
  if (name) {
    const idx = header.indexOf(name);
    for (const l of header.slice(idx + 1, idx + 3)) {
      if (!l.includes("@") && !/\d{4}/.test(l) && l.length < 80) {
        headline = l;
        break;
      }
    }
  }
  const summary = (sections.summary ?? []).map((l) => l.trim()).filter(Boolean).join(" ");
  const skills = parseList(sections.skills ?? []);
  const have = new Set(skills.map(canonical));
  for (const s of findSkills(text)) if (!have.has(s)) skills.push(s);

  return normalizeProfile({
    name,
    email,
    phone,
    location,
    headline,
    summary,
    skills,
    experience: parseExperience(sections.experience ?? []),
    education: parseEducation(sections.education ?? []),
    certifications: parseList(sections.certifications ?? []),
    languages: parseList(sections.languages ?? []),
  });
}
