import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AIDeps, UsageStore } from "@/lib/ai";
import type { AIProvider } from "@/lib/ai/provider";
import { applyReview, candidateSummary } from "@/lib/match/ai-review";
import { runMatching } from "@/lib/match/run";
import { annualise, cvSkillSet, oneLineReason, scoreJob, type JobForMatch, type ProfileForMatch } from "@/lib/match/score";
import { memoryMatchStore, type MatchUser } from "@/lib/match/store";
import { demo } from "@/lib/sources/connectors";
import type { CvProfile } from "@/lib/cv/types";

const cv = JSON.parse(readFileSync("tests/fixtures/sample_cv.expected.json", "utf8")) as CvProfile;
const skills = cvSkillSet(cv);
const profile = (over: Partial<ProfileForMatch> = {}): ProfileForMatch => ({
  roles: ["Python Developer", "Software Developer"], locations: [], min_salary: null, employment_types: [], keywords: [], exclude_keywords: [], ...over,
});
const job = (over: Partial<JobForMatch> = {}): JobForMatch => ({
  title: "Python Developer", description: "We use Python, Flask, SQL and Docker.", location: "Manchester", salary_min: 45000, salary_max: 60000, employment_type: "permanent", ...over,
});
const score = (j: JobForMatch, p: ProfileForMatch) => {
  const r = scoreJob(j, p, skills);
  if (r.filtered !== null) throw new Error("unexpectedly filtered: " + r.filtered);
  return r;
};
const filtered = (j: JobForMatch, p: ProfileForMatch) => scoreJob(j, p, skills).filtered;

async function demoJobs() {
  return (await demo(true, () => Date.parse("2026-11-15T09:00:00Z")).fetch([], async () => ({}))).jobs;
}

describe("demo jobs against the sample CV", () => {
  it("Python developer jobs score highest and the accountant job lowest", async () => {
    const jobs = await demoJobs();
    const scored = jobs.map((j) => ({ title: j.title, r: score(j, profile()) })).sort((a, b) => b.r.score - a.r.score);
    const by = Object.fromEntries(scored.map((s) => [s.title, s.r.score]));
    expect(by["Python Developer"]).toBe(100);
    expect(by["Python Developer (Contract)"]).toBe(100);
    expect(by["Software Developer"]).toBe(100);
    const lowest = Math.min(...scored.map((s) => s.r.score));
    expect(by["Accounts Assistant"]).toBe(lowest);
    expect(by["Accounts Assistant"]).toBeLessThanOrEqual(20);
    // Sensible middle: related but weaker jobs sit between.
    for (const mid of ["Senior Backend Engineer", "DevOps Engineer", "QA Test Engineer", "Machine Learning Engineer", "Junior Web Developer"]) {
      expect(by[mid], mid).toBeGreaterThan(by["Accounts Assistant"]);
      expect(by[mid], mid).toBeLessThan(75);
    }
    expect(by["Data Analyst"]).toBeLessThan(by["QA Test Engineer"]);
    // Exactly the three strong jobs clear the default threshold of 75.
    expect(scored.filter((s) => s.r.score >= 75).map((s) => s.title).sort()).toEqual(["Python Developer", "Python Developer (Contract)", "Software Developer"]);
  });

  it("explains each score: parts add up, and skills are listed", async () => {
    const jobs = await demoJobs();
    const senior = score(jobs.find((j) => j.title === "Senior Backend Engineer")!, profile());
    const b = senior.breakdown;
    expect(b.role.points + b.skills.points + b.location.points + b.salary.points).toBe(senior.score);
    expect([b.role.max, b.skills.max, b.location.max, b.salary.max]).toEqual([35, 45, 10, 10]);
    expect(senior.matching_skills).toEqual(expect.arrayContaining(["python", "postgresql", "aws"]));
    expect(senior.missing_skills).toEqual(expect.arrayContaining(["django", "kubernetes", "terraform"]));
    expect(senior.reasons).toHaveLength(4);
    expect(oneLineReason(b)).toMatch(/of \d+ skills in the advert are on your CV\.$/);
  });
});

describe("role and title fit (35)", () => {
  const role = (title: string, roles = ["Python Developer"]) => score(job({ title }), profile({ roles })).breakdown.role.points;
  it("gives full marks for the same title, however it is written", () => {
    expect(role("Python Developer")).toBe(35);
    expect(role("PYTHON DEVELOPER - Manchester")).toBe(35);
    expect(role("Python Engineer")).toBe(35);
    expect(role("Python Developer II")).toBe(35);
  });
  it("gives part marks for a partial match and none for an unrelated title", () => {
    expect(role("Software Developer")).toBeGreaterThan(10);
    expect(role("Software Developer")).toBeLessThan(25);
    expect(role("Accounts Assistant")).toBe(0);
    expect(role("Head Chef")).toBe(0);
  });
  it("marks down the wrong level", () => {
    expect(role("Senior Python Developer")).toBeLessThan(35);
    expect(role("Junior Python Developer")).toBeLessThan(35);
    expect(role("Senior Python Developer", ["Senior Python Developer"])).toBe(35);
    expect(role("Junior Python Developer", ["Senior Python Developer"])).toBeLessThan(role("Python Developer", ["Senior Python Developer"]));
  });
  it("uses the best of several wanted titles", () => {
    expect(role("Data Analyst", ["Python Developer", "Data Analyst"])).toBe(35);
  });
  it("handles titles that are only a level word, like Project Manager", () => {
    expect(role("Project Manager", ["Project Manager"])).toBe(35);
    expect(role("Python Developer", ["Project Manager"])).toBe(0);
  });
});

describe("skills (45)", () => {
  it("scores the share of the advert's skills that are on the CV", () => {
    const r = score(job({ description: "Python, Flask, Kubernetes and Terraform" }), profile());
    expect(r.matching_skills).toEqual(["python", "flask"]);
    expect(r.missing_skills).toEqual(["kubernetes", "terraform"]);
    expect(r.breakdown.skills.points).toBe(23);
  });
  it("counts skills only named in the CV's bullets", () => {
    expect(skills.has("testing")).toBe(true);
    expect(skills.has("rest apis")).toBe(true);
    expect(skills.has("kubernetes")).toBe(false);
  });
  it("gives half marks when the advert names no known skills", () => {
    const r = score(job({ title: "Developer", description: "A great opportunity in a friendly team." }), profile());
    expect(r.breakdown.skills.points).toBe(23);
    expect(r.breakdown.skills.reason).toMatch(/no skills we recognise/);
  });
  it("gives a small lift for the user's keywords, never above the maximum", () => {
    const base = score(job({ description: "Python and Kubernetes in fintech" }), profile()).breakdown.skills.points;
    const lifted = score(job({ description: "Python and Kubernetes in fintech" }), profile({ keywords: ["fintech", "banking"] })).breakdown.skills;
    expect(lifted.points).toBeGreaterThan(base);
    expect(lifted.reason).toMatch(/keyword fintech/);
    expect(score(job(), profile({ keywords: ["python", "flask", "sql", "docker"] })).breakdown.skills.points).toBe(45);
  });
});

describe("location (10)", () => {
  const loc = (location: string, locations: string[]) => scoreJob(job({ location }), profile({ locations }), skills);
  const pts = (location: string, locations: string[]) => {
    const r = loc(location, locations);
    return r.filtered === null ? r.breakdown.location.points : r.filtered;
  };
  it("full marks in one of the user's locations, or anywhere in the UK when none are set", () => {
    expect(pts("Manchester", ["Manchester", "Leeds"])).toBe(10);
    expect(pts("Salford, Greater Manchester", ["manchester"])).toBe(10);
    expect(pts("Cardiff, London or Remote (UK); London", ["London"])).toBe(10);
    expect(pts("Leeds", [])).toBe(10);
  });
  it("handles remote", () => {
    expect(pts("Remote", ["Manchester", "Remote"])).toBe(10);
    expect(pts("Remote (UK)", ["Manchester"])).toBe(5);
  });
  it("filters out jobs in a place the user did not choose", () => {
    expect(pts("Leeds", ["Manchester"])).toMatch(/Not in your locations/);
  });
  it("filters out jobs abroad even when the user is open to anywhere", () => {
    expect(pts("Barcelona", [])).toMatch(/Outside the UK/);
    expect(pts("New York, NY", [])).toMatch(/Outside the UK/);
    expect(pts("Remote - EMEA", [])).toMatch(/Outside the UK/);
    expect(pts("London or Barcelona", [])).toBe(10);
    expect(pts("York", [])).toBe(10);
  });
  it("half marks when the advert gives no location", () => {
    expect(pts("", ["Manchester"])).toBe(5);
  });
});

describe("salary (10)", () => {
  const sal = (min: number | null, max: number | null, want: number | null) => {
    const r = scoreJob(job({ salary_min: min, salary_max: max }), profile({ min_salary: want }), skills);
    return r.filtered === null ? r.breakdown.salary.points : r.filtered;
  };
  it("scores against the user's minimum", () => {
    expect(sal(45000, 60000, null)).toBe(10);
    expect(sal(45000, 60000, 50000)).toBe(10);
    expect(sal(40000, 45000, 50000)).toBe(5);
    expect(sal(null, null, 50000)).toBe(5);
    expect(sal(30000, null, 30000)).toBe(10);
  });
  it("filters out pay far below the minimum", () => {
    expect(sal(25000, 29000, 50000)).toMatch(/far below your minimum \(up to £29,000\)/);
  });
  it("reads day and hourly rates as yearly pay", () => {
    expect(annualise(450)).toBe(99000);
    expect(annualise(25)).toBe(45000);
    expect(annualise(45000)).toBe(45000);
    expect(sal(400, 500, 60000)).toBe(10);
  });
});

describe("hard filters", () => {
  it("excluded keywords remove a job, matching whole words only", () => {
    expect(filtered(job({ title: "Senior Python Developer" }), profile({ exclude_keywords: ["senior"] }))).toMatch(/Mentions “senior”/);
    expect(filtered(job({ description: "Some PHP legacy code" }), profile({ exclude_keywords: ["PHP"] }))).toMatch(/PHP/);
    expect(filtered(job({ description: "We value seniority-free culture" }), profile({ exclude_keywords: ["senior"] }))).toBeNull();
    expect(filtered(job(), profile({ exclude_keywords: ["", "  "] }))).toBeNull();
  });
  it("job type must be one the user chose, when both are known", () => {
    expect(filtered(job({ employment_type: "contract" }), profile({ employment_types: ["permanent"] }))).toMatch(/contract/);
    expect(filtered(job({ title: "Python Developer (Contract)", employment_type: "" }), profile({ employment_types: ["permanent"] }))).toMatch(/contract/);
    expect(filtered(job({ employment_type: "part-time" }), profile({ employment_types: ["full-time"] }))).toMatch(/part-time/);
    expect(filtered(job({ employment_type: "permanent" }), profile({ employment_types: ["permanent", "contract"] }))).toBeNull();
    // Hours and tenure are separate questions: "full-time" does not rule out "permanent".
    expect(filtered(job({ employment_type: "full-time" }), profile({ employment_types: ["permanent"] }))).toBeNull();
    expect(filtered(job({ employment_type: "" }), profile({ employment_types: ["permanent"] }))).toBeNull();
    expect(filtered(job({ employment_type: "contract" }), profile())).toBeNull();
  });
});

// ------------------------------------------------------------------ matching run + AI review
function fakeAI(reply: (prompt: string) => unknown, opts: { used?: number; limit?: number } = {}) {
  const sent: string[] = [];
  const provider: AIProvider = {
    model: "test-model",
    async completeJson({ system, user }) {
      sent.push(system + "\n" + user);
      return { content: JSON.stringify(reply(user)), promptTokens: 10, completionTokens: 5 };
    },
  };
  let used = opts.used ?? 0;
  const usage: UsageStore = { countToday: async () => used, log: async () => void used++ };
  const deps: AIDeps = { provider, usage, dailyLimit: opts.limit ?? 200 };
  return { deps, sent };
}

async function setup(profileOver: Partial<MatchUser["profiles"][number]> = {}, extraJobs = 0) {
  const jobs = (await demoJobs()).map((j, i) => ({ ...j, id: `j${i}` }));
  for (let i = 0; i < extraJobs; i++) jobs.push({ ...jobs[0], id: `x${i}`, title: "Python Developer", location: "Leeds" });
  const user: MatchUser = { userId: "u1", cv, rightToWork: "yes", profiles: [{ id: "p1", min_match: 75, ...profile(), ...profileOver }] };
  return memoryMatchStore({ users: [user], jobs });
}

describe("matching run", () => {
  it("scores every job once; running again adds nothing", async () => {
    const m = await setup();
    const first = await runMatching({ store: m.store });
    expect(first).toEqual({ newMatches: 3, scored: 12, filtered: 0, aiReviews: 0 });
    expect(m.rows).toHaveLength(12);
    const second = await runMatching({ store: m.store });
    expect(second).toEqual({ newMatches: 0, scored: 0, filtered: 0, aiReviews: 0 });
    expect(m.rows).toHaveLength(12);
  });

  it("stores filtered jobs with the reason and no score", async () => {
    const m = await setup({ employment_types: ["permanent"], min_salary: 40000 });
    const res = await runMatching({ store: m.store });
    expect(res.filtered).toBeGreaterThan(0);
    const contract = m.rows.find((r) => r.job_id === "j9")!;
    expect(contract).toMatchObject({ score: 0, filtered_reason: "Job type is contract, which you did not choose" });
    expect(m.rows.find((r) => r.job_id === "j7")!.filtered_reason).toMatch(/Salary far below/);
  });

  it("AI review adjusts scores, and 'not eligible' always lands below the minimum match", async () => {
    const m = await setup();
    const ai = fakeAI((prompt) =>
      /Title: Software Developer/.test(prompt) ? { eligible: false, adjustment: -5, reason: "Requires UK security clearance." }
      : /Contract/.test(prompt) ? { eligible: true, adjustment: -12, reason: "Contract role; candidate history is permanent." }
      : { eligible: true, adjustment: 99, reason: "Good fit." });
    const res = await runMatching({ store: m.store, ai: ai.deps });
    const by = (id: string) => m.rows.find((r) => r.job_id === id)!;
    expect(by("j5")).toMatchObject({ score: 74, ai_reviewed: true });
    expect(by("j5").reasons.at(-1)).toBe("AI check: Requires UK security clearance.");
    expect(by("j9").score).toBe(88);
    expect(by("j0").score).toBe(100);
    expect((by("j0").breakdown as { ai: { adjustment: number } }).ai.adjustment).toBe(10);
    // Only jobs at or above (75 − 10) are reviewed.
    expect(res.aiReviews).toBe(m.rows.filter((r) => r.ai_reviewed).length);
    const keyword = (r: (typeof m.rows)[number]) => {
      const b = r.breakdown as { role: { points: number }; skills: { points: number }; location: { points: number }; salary: { points: number } };
      return b.role.points + b.skills.points + b.location.points + b.salary.points;
    };
    expect(m.rows.filter((r) => r.ai_reviewed).every((r) => keyword(r) >= 65)).toBe(true);
    expect(m.rows.filter((r) => !r.ai_reviewed).every((r) => keyword(r) < 65)).toBe(true);
    expect(["j0", "j5", "j9"].every((id) => by(id).ai_reviewed)).toBe(true);
    // A later run does not pay to review them again.
    expect((await runMatching({ store: m.store, ai: ai.deps })).aiReviews).toBe(0);
  });

  it("caps AI reviews at 20 per user per run", async () => {
    const m = await setup({}, 30);
    const ai = fakeAI(() => ({ eligible: true, adjustment: 0, reason: "" }));
    const res = await runMatching({ store: m.store, ai: ai.deps });
    expect(res.aiReviews).toBe(20);
    expect(ai.sent).toHaveLength(20);
    expect(m.rows.filter((r) => r.score === 100 && !r.ai_reviewed)).toHaveLength(13);
  });

  it("keeps the keyword score when the AI is unavailable, over its limit, or replies with rubbish", async () => {
    for (const ai of [fakeAI(() => ({ eligible: true, adjustment: -20 }), { used: 200, limit: 200 }), fakeAI(() => ({ verdict: "maybe" })), fakeAI(() => { throw new Error("down"); })]) {
      const m = await setup();
      const res = await runMatching({ store: m.store, ai: ai.deps });
      expect(res.aiReviews).toBe(0);
      expect(m.rows.find((r) => r.job_id === "j0")).toMatchObject({ score: 100, ai_reviewed: false });
      expect(ai.sent.length).toBeLessThanOrEqual(1);
    }
  });

  it("tells the AI about level and skills only: no name, contact details or employers", async () => {
    const m = await setup();
    const ai = fakeAI(() => ({ eligible: true, adjustment: 0, reason: "ok" }));
    await runMatching({ store: m.store, ai: ai.deps });
    const all = ai.sent.join("\n");
    expect(all).toContain("Senior Software Developer (Mar 2021 - Present)");
    expect(all).toContain("Right to work in the UK: yes");
    for (const secret of ["Priya", "Shah", "priya.shah", "07700", "Northwind", "Brightside", "University of Leeds"]) expect(all, secret).not.toContain(secret);
    expect(candidateSummary(cv, { wantedTypes: [] })).toContain("Right to work in the UK: not stated");
  });

  it("applyReview clamps the result", () => {
    expect(applyReview(95, { eligible: true, adjustment: 10, reason: "" }, 75)).toBe(100);
    expect(applyReview(10, { eligible: true, adjustment: -30, reason: "" }, 75)).toBe(0);
    expect(applyReview(100, { eligible: false, adjustment: 0, reason: "" }, 75)).toBe(74);
    expect(applyReview(100, { eligible: false, adjustment: 0, reason: "" }, 0)).toBe(0);
  });

  it("skips users with no approved CV or no active search (the store only returns ready users)", async () => {
    const m = memoryMatchStore({ users: [], jobs: [] });
    expect(await runMatching({ store: m.store })).toEqual({ newMatches: 0, scored: 0, filtered: 0, aiReviews: 0 });
  });
});

import { findSkills as findSkillsForDesign } from "@/lib/skills";
describe("design skills", () => {
  it("recognises UI/UX and product design skills in an advert", () => {
    const found = findSkillsForDesign("You will run user research, build prototypes in Figma, own our design system and meet WCAG accessibility.");
    expect(found).toEqual(expect.arrayContaining(["user research", "prototyping", "figma", "design systems", "accessibility"]));
  });
});

describe("short adverts", () => {
  it("does not give full skill marks when the advert names only one skill", () => {
    const r = scoreJob(job({ title: "Python Developer", description: "We use Python." }), profile(), new Set(["python"]));
    expect(r.breakdown.skills.points).toBeLessThan(45);
    expect(r.breakdown.skills.reason).toContain("short advert");
  });
});
