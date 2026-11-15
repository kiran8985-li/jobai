import { canonical, findSkills } from "../skills";
import type { CvProfile } from "../cv/types";

/**
 * Keyword matching: a 0–100 score for one job against one search profile and the user's master CV.
 * Role/title fit 35 · required-skill overlap 45 · location 10 · salary 10. Hard filters run first.
 * Pure code: no AI, no database. This is also the fallback whenever the AI is unavailable.
 */

export const WEIGHTS = { role: 35, skills: 45, location: 10, salary: 10 } as const;

export type JobForMatch = {
  title: string;
  description: string;
  location: string;
  salary_min: number | null;
  salary_max: number | null;
  employment_type: string;
};
export type ProfileForMatch = {
  roles: string[];
  locations: string[];
  min_salary: number | null;
  employment_types: string[];
  keywords: string[];
  exclude_keywords: string[];
};
export type Part = { points: number; max: number; reason: string };
export type Breakdown = { role: Part; skills: Part; location: Part; salary: Part; ai?: { adjustment: number; eligible: boolean; reason: string } };
export type MatchResult =
  | { filtered: string }
  | { filtered: null; score: number; breakdown: Breakdown; matching_skills: string[]; missing_skills: string[]; reasons: string[] };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, phrase: string) =>
  new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(phrase.trim()).replace(/\s+/g, "\\s+")}(?![A-Za-z0-9])`, "i").test(text);

/** Every canonical skill the master CV supports: its skill list plus skills named in its text. */
export function cvSkillSet(cv: CvProfile): Set<string> {
  const text = [cv.headline, cv.summary, ...cv.certifications, ...cv.experience.flatMap((e) => [e.title, ...e.bullets]), ...cv.projects.flatMap((p) => [p.name, p.tech, ...p.bullets])].join("\n");
  return new Set([...cv.skills.map(canonical), ...findSkills(text)]);
}

// ---------------------------------------------------------------- role / title
const STOP = new Set(["of", "and", "the", "a", "an", "in", "for", "to", "with", "at", "or"]);
const SENIOR = new Set(["senior", "sr", "lead", "principal", "staff", "head", "director", "manager", "architect"]);
const JUNIOR = new Set(["junior", "jr", "graduate", "trainee", "intern", "internship", "apprentice", "entry"]);
const LEVEL_NEUTRAL = new Set(["mid", "midlevel", "associate", "ii", "iii", "iv", "i"]);
const SYNONYMS = [
  ["developer", "engineer", "programmer", "dev", "coder"],
  ["qa", "test", "tester", "testing", "sdet"],
  ["devops", "sre", "platform"],
  ["frontend", "front", "ui"],
  ["backend", "back", "server"],
  ["analyst", "analytics"],
  ["support", "helpdesk", "servicedesk"],
  ["admin", "administrator"],
];
const SYN = new Map<string, number>();
SYNONYMS.forEach((group, i) => group.forEach((w) => SYN.set(w, i)));

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []).map((w) => w.replace(/^\.+|\.+$/g, "")).filter((w) => w && !STOP.has(w));
const level = (tokens: string[]) => (tokens.some((t) => JUNIOR.has(t)) ? -1 : tokens.some((t) => SENIOR.has(t)) ? 1 : 0);
const core = (tokens: string[]) => tokens.filter((t) => !SENIOR.has(t) && !JUNIOR.has(t) && !LEVEL_NEUTRAL.has(t));
const same = (a: string, b: string) => a === b || (SYN.has(a) && SYN.get(a) === SYN.get(b));

/** 0–1: how much of a wanted job title appears in the job's title, less a penalty for the wrong level. */
function titleFit(role: string, title: string): number {
  const roleTokens = words(role);
  const titleTokens = words(title);
  const want = core(roleTokens);
  const have = core(titleTokens);
  // "Manager" and similar are both a level and a job: if the role is only level words, compare everything.
  const wantAll = want.length ? want : roleTokens;
  const haveAll = want.length ? have : titleTokens;
  if (!wantAll.length) return 0;
  const hit = wantAll.filter((w) => haveAll.some((h) => same(w, h))).length / wantAll.length;
  if (hit === 0) return 0;
  const gap = Math.abs(level(titleTokens) - level(roleTokens));
  const penalty = want.length ? (gap === 2 ? 0.45 : gap === 1 && level(roleTokens) === 0 ? 0.3 : gap === 1 ? 0.15 : 0) : 0;
  return Math.max(0, hit - penalty);
}

function scoreRole(job: JobForMatch, profile: ProfileForMatch): Part {
  let best = 0;
  let bestRole = "";
  for (const role of profile.roles) {
    const fit = titleFit(role, job.title);
    if (fit > best) [best, bestRole] = [fit, role];
  }
  const points = Math.round(WEIGHTS.role * best);
  const reason =
    best >= 0.99 ? `Title matches your search “${bestRole}”`
    : best >= 0.6 ? `Title is close to your search “${bestRole}”`
    : best > 0 ? `Title partly matches “${bestRole}”`
    : "Title does not match any of your job titles";
  return { points, max: WEIGHTS.role, reason };
}

// ---------------------------------------------------------------- skills
function scoreSkills(job: JobForMatch, profile: ProfileForMatch, cvSkills: Set<string>) {
  const text = `${job.title}\n${job.description}`;
  const required = findSkills(text);
  const matching = required.filter((s) => cvSkills.has(s));
  const missing = required.filter((s) => !cvSkills.has(s));
  const keywordHits = profile.keywords.filter((k) => mentions(text, k));

  let ratio: number;
  let reason: string;
  if (required.length === 0) {
    ratio = 0.5;
    reason = "The advert names no skills we recognise, so skills count as half";
  } else {
    ratio = matching.length / required.length;
    reason = `${matching.length} of ${required.length} skills in the advert are on your CV`;
  }
  if (keywordHits.length) {
    ratio = Math.min(1, ratio + 0.05 * keywordHits.length);
    reason += `; mentions your keyword${keywordHits.length > 1 ? "s" : ""} ${keywordHits.join(", ")}`;
  }
  return { part: { points: Math.round(WEIGHTS.skills * ratio), max: WEIGHTS.skills, reason }, matching, missing };
}

// ---------------------------------------------------------------- location
const UK = /\b(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|liverpool|sheffield|newcastle|nottingham|cardiff|belfast|cambridge|oxford|reading|leicester|coventry|brighton|southampton|portsmouth|york|aberdeen|dundee|swansea|milton keynes|norwich|exeter|bath|derby|stoke|sunderland|hull|plymouth|wolverhampton|bradford|luton|swindon|warrington|slough|guildford|cheltenham|ipswich|peterborough)\b/i;
const ABROAD = /\b(usa|u\.s\.|united states|new york|san francisco|seattle|austin|boston|chicago|los angeles|washington|denver|atlanta|canada|toronto|vancouver|ireland|dublin|france|paris|germany|berlin|munich|spain|barcelona|madrid|portugal|lisbon|netherlands|amsterdam|poland|warsaw|krakow|italy|milan|sweden|stockholm|denmark|copenhagen|switzerland|zurich|india|bangalore|bengaluru|hyderabad|pune|singapore|australia|sydney|melbourne|japan|tokyo|uae|dubai|israel|tel aviv|brazil|mexico|emea|apac|latam|europe)\b/i;
const REMOTE = /\b(remote|work from home|home[- ]based|wfh|anywhere)\b/i;

/** Returns a part, or a filter reason when the job is clearly somewhere the user does not want. */
function scoreLocation(job: JobForMatch, profile: ProfileForMatch): Part | { filtered: string } {
  const loc = job.location.trim();
  const max = WEIGHTS.location;
  const wanted = profile.locations.map((l) => l.trim()).filter(Boolean);
  const wantsRemote = wanted.some((l) => REMOTE.test(l));
  const places = wanted.filter((l) => !REMOTE.test(l));
  const isRemote = REMOTE.test(loc);
  // "New York" must not count as York.
  const inUk = UK.test(loc.replace(/new york/gi, " "));

  if (!loc) return { points: Math.round(max / 2), max, reason: "The advert gives no location" };
  if (ABROAD.test(loc) && !inUk) return { filtered: `Outside the UK (${loc.slice(0, 60)})` };

  if (!wanted.length) return { points: max, max, reason: isRemote ? "Remote" : `In ${loc}; you are open to anywhere in the UK` };
  const hit = places.find((p) => mentions(loc, p) || loc.toLowerCase().includes(p.toLowerCase()));
  if (hit) return { points: max, max, reason: `In ${hit}, one of your locations` };
  if (isRemote && wantsRemote) return { points: max, max, reason: "Remote, which you asked for" };
  if (isRemote) return { points: Math.round(max / 2), max, reason: "Remote; you did not list remote" };
  return { filtered: `Not in your locations (${loc.slice(0, 60)})` };
}

// ---------------------------------------------------------------- salary
/** Yearly figure for a salary that may be hourly, daily or yearly. */
export function annualise(amount: number): number {
  if (amount < 200) return amount * 1800; // hourly
  if (amount < 2500) return amount * 220; // day rate
  return amount;
}

function scoreSalary(job: JobForMatch, profile: ProfileForMatch): Part | { filtered: string } {
  const max = WEIGHTS.salary;
  const min = profile.min_salary;
  if (!min) return { points: max, max, reason: "You set no minimum salary" };
  const top = job.salary_max ?? job.salary_min;
  if (!top) return { points: Math.round(max / 2), max, reason: "The advert gives no salary" };
  const yearly = annualise(top);
  const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
  if (yearly >= min) return { points: max, max, reason: `Pays up to ${pounds(yearly)}, at or above your minimum` };
  if (yearly >= 0.8 * min) return { points: Math.round(max / 2), max, reason: `Pays up to ${pounds(yearly)}, a little under your minimum` };
  return { filtered: `Salary far below your minimum (up to ${pounds(yearly)})` };
}

// ---------------------------------------------------------------- employment type
const TENURE = ["permanent", "contract", "temporary", "internship"] as const;
const HOURS = ["full-time", "part-time"] as const;

function jobTypes(job: JobForMatch) {
  const text = `${job.employment_type} ${job.title}`.toLowerCase();
  const tenure =
    /\b(contract|contractor|freelance|day rate|fixed[- ]term|ftc)\b/.test(text) ? "contract"
    : /\b(temp|temporary)\b/.test(text) ? "temporary"
    : /\b(intern|internship|placement)\b/.test(text) ? "internship"
    : /\bpermanent\b/.test(text) ? "permanent"
    : null;
  const hours = /\bpart[- ]?time\b/.test(text) ? "part-time" : /\bfull[- ]?time\b/.test(text) ? "full-time" : null;
  return { tenure, hours };
}

function typeFilter(job: JobForMatch, profile: ProfileForMatch): string | null {
  const wantTenure = profile.employment_types.filter((t) => (TENURE as readonly string[]).includes(t));
  const wantHours = profile.employment_types.filter((t) => (HOURS as readonly string[]).includes(t));
  const { tenure, hours } = jobTypes(job);
  if (tenure && wantTenure.length && !wantTenure.includes(tenure)) return `Job type is ${tenure}, which you did not choose`;
  if (hours && wantHours.length && !wantHours.includes(hours)) return `Job is ${hours}, which you did not choose`;
  return null;
}

// ---------------------------------------------------------------- total
export function scoreJob(job: JobForMatch, profile: ProfileForMatch, cvSkills: Set<string>): MatchResult {
  // Hard filters first: a filtered job gets no score and can never be applied for.
  const text = `${job.title}\n${job.description}`;
  const banned = profile.exclude_keywords.find((k) => k.trim() && mentions(text, k));
  if (banned) return { filtered: `Mentions “${banned}”, which you excluded` };
  const type = typeFilter(job, profile);
  if (type) return { filtered: type };
  const salary = scoreSalary(job, profile);
  if ("filtered" in salary) return { filtered: salary.filtered };
  const location = scoreLocation(job, profile);
  if ("filtered" in location) return { filtered: location.filtered };

  const role = scoreRole(job, profile);
  const skills = scoreSkills(job, profile, cvSkills);
  const breakdown: Breakdown = { role, skills: skills.part, location, salary };
  const score = Math.max(0, Math.min(100, role.points + skills.part.points + location.points + salary.points));
  return {
    filtered: null,
    score,
    breakdown,
    matching_skills: skills.matching,
    missing_skills: skills.missing,
    reasons: [role.reason, skills.part.reason, location.reason, salary.reason],
  };
}

/** The single line shown under a job in the list. */
export function oneLineReason(b: Breakdown): string {
  const ai = b.ai?.reason ? ` AI check: ${b.ai.reason}` : "";
  const skills = b.skills.reason.split(";")[0];
  return `${b.role.reason}; ${skills.charAt(0).toLowerCase()}${skills.slice(1)}.${ai}`;
}
