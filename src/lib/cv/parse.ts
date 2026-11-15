import "server-only";
import { AIUnavailable, chatJson, defaultAIDeps, type AIDeps } from "../ai";
import { canonical } from "../skills";
import { heuristicParse } from "./heuristic";
import { redact, restoreContact } from "./redact";
import { normalizeProfile, type CvProfile, type ParsedCv } from "./types";

const AI_SYSTEM =
  "You extract structured data from CVs. Copy only what is written in the CV. " +
  "Never invent employers, dates, qualifications, skills or numbers. Use empty strings or empty lists " +
  "when something is not present. Put personal, academic or side projects under projects, not experience. Personal details have been replaced with placeholders such as [NAME]; " +
  "leave name, email, phone and location empty. Reply with one JSON object only.";
const AI_SCHEMA =
  '{"name":"","email":"","phone":"","location":"","headline":"","summary":"",' +
  '"skills":[""],"experience":[{"title":"","company":"","dates":"","bullets":[""]}],' +
  '"projects":[{"name":"","tech":"","bullets":[""]}],' +
  '"education":[{"degree":"","institution":"","dates":""}],"certifications":[""],"languages":[""]}';

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9+#.%]+/g) ?? [];

/**
 * Drops anything the AI returned that is not actually in the CV text, and records why.
 * This is what stops an invented employer, qualification, skill or figure reaching the master CV.
 */
export function verifyAgainstText(profile: CvProfile, text: string): { profile: CvProfile; flags: string[] } {
  const low = squash(text);
  const words = new Set(tokens(text));
  const mentioned = (v: string) => !v.trim() || low.includes(squash(v));
  const flags: string[] = [];

  const bulletOk = (b: string) => {
    if (low.includes(squash(b))) return true;
    const t = tokens(b);
    if (!t.length) return false;
    // Reworded slightly (line wraps, punctuation) is fine; new numbers or mostly new words are not.
    if (t.some((x) => /\d/.test(x) && !words.has(x))) return false;
    return t.filter((x) => words.has(x)).length / t.length >= 0.9;
  };

  const experience = [];
  for (const e of profile.experience) {
    if (!mentioned(e.company) || !mentioned(e.title)) {
      flags.push(`Removed experience entry not found in your CV: ${e.title} / ${e.company}`);
      continue;
    }
    const bullets = e.bullets.filter((b) => {
      if (bulletOk(b)) return true;
      flags.push(`Removed a bullet not found in your CV: ${b.slice(0, 80)}`);
      return false;
    });
    experience.push({ ...e, dates: mentioned(e.dates) ? e.dates : "", bullets });
    if (!mentioned(e.dates)) flags.push(`Removed dates not found in your CV for ${e.title}: ${e.dates}`);
  }

  const projects = [];
  for (const pr of profile.projects) {
    if (!mentioned(pr.name)) {
      flags.push(`Removed project not found in your CV: ${pr.name}`);
      continue;
    }
    const bullets = pr.bullets.filter((b) => {
      if (bulletOk(b)) return true;
      flags.push(`Removed a bullet not found in your CV: ${b.slice(0, 80)}`);
      return false;
    });
    projects.push({ ...pr, tech: mentioned(pr.tech) ? pr.tech : "", bullets });
  }

  const education = profile.education.filter((e) => {
    if (mentioned(e.institution) && mentioned(e.degree)) return true;
    flags.push(`Removed qualification not found in your CV: ${e.degree} / ${e.institution}`);
    return false;
  });

  const certifications = profile.certifications.filter((c) => {
    if (mentioned(c)) return true;
    flags.push(`Removed certification not found in your CV: ${c}`);
    return false;
  });

  const skills = profile.skills.filter((s) => {
    if (low.includes(s.toLowerCase()) || low.includes(canonical(s))) return true;
    flags.push(`Removed skill not found in your CV: ${s}`);
    return false;
  });

  const languages = profile.languages.filter((l) => mentioned(l));
  return { profile: { ...profile, experience, projects, education, certifications, skills, languages }, flags };
}

/**
 * AI first (on redacted text), heuristic fallback. Contact details always come from code,
 * never from the AI. Returns the profile, how it was read, and anything that was removed.
 */
export async function parseCv(text: string, userId: string | null, deps?: AIDeps): Promise<ParsedCv> {
  const { text: redacted, contact } = redact(text);
  try {
    const data = await chatJson(
      {
        system: AI_SYSTEM,
        user: `Return JSON in exactly this shape:\n${AI_SCHEMA}\n\nCV text:\n${redacted.slice(0, 15000)}`,
        purpose: "cv_parse",
        userId,
        // A full CV comes back as JSON, and some models spend part of the allowance thinking first.
        maxTokens: 12000,
      },
      deps ?? defaultAIDeps(),
    );
    const raw = normalizeProfile(data);
    raw.headline = restoreContact(raw.headline, { name: "", email: "", phone: "", location: "" });
    raw.summary = restoreContact(raw.summary, { name: "", email: "", phone: "", location: "" });
    const { profile, flags } = verifyAgainstText(raw, text);
    if (profile.experience.length || profile.skills.length) {
      return { profile: { ...profile, ...contact }, parsedBy: "ai", flags };
    }
  } catch (err) {
    if (!(err instanceof AIUnavailable)) throw err;
  }
  return { profile: heuristicParse(text), parsedBy: "heuristic", flags: [] };
}
