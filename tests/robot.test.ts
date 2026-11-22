import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runApply } from "@/lib/apply/run";
import { memoryApplyStore, type ApplyCandidate, type ApplyJob, type ApplyUser } from "@/lib/apply/store";
import type { CvProfile } from "@/lib/cv/types";
import { buildFillData } from "@/lib/fill-data";
import { candidateFacts, makeAnswerer, numbersBacked } from "@/lib/robot/answer";
import type { Robot, RobotResult } from "@/lib/robot/types";

const cv = JSON.parse(readFileSync("tests/fixtures/sample_cv.expected.json", "utf8")) as CvProfile;
const T0 = Date.parse("2026-11-16T10:00:00Z");
const job = (id: string, over: Partial<ApplyJob> = {}): ApplyJob => ({ id, title: `Job ${id}`, company: "Acme Ltd", apply_url: `https://boards.example.com/acme/${id}`, apply_email: "", apply_method: "ats", questions: [], ...over });
const cand = (j: ApplyJob): ApplyCandidate => ({ profileId: "p1", score: 90, job: j, tailored: { content: cv, pdf_path: `u1/${j.id}.pdf` } });
const user = (candidates: ApplyCandidate[], profile: Partial<ApplyUser["profiles"][number]> = {}): ApplyUser => ({
  userId: "u1", paused: false, answers: { right_to_work_uk: "yes" },
  profiles: [{ id: "p1", name: "Python jobs", min_match: 75, daily_limit: 10, auto_apply: true, consent_at: "2026-11-01T00:00:00Z", is_active: true, ...profile }],
  candidates,
});
const robotSaying = (outcome: RobotResult["outcome"], reason?: string) => vi.fn<Robot>(async () => ({ outcome, reason, filled: ["Email"], aiAnswered: [], unanswered: [], screenshot: new Uint8Array([137, 80]) }));

describe("apply robot in the apply run", () => {
  it("live: a confirmed submit is Sent, with its screenshot kept", async () => {
    const m = memoryApplyStore([user([cand(job("1"))])]);
    const saved: string[] = [];
    m.store.saveScreenshot = async (_u, id) => { saved.push(id); return `u1/robot/${id}.png`; };
    const robot = robotSaying("submitted");
    const r = await runApply({ store: m.store, mode: "dry_run", robot, robotMode: "live", now: () => T0 });
    expect(r.sent).toBe(1);
    expect(robot.mock.calls[0][0].mode).toBe("live");
    expect(m.applications[0]).toMatchObject({ status: "sent", method: "ats" });
    expect(m.applications[0].detail).toMatchObject({ robot: true, screenshot_path: "u1/robot/a1.png" });
    expect(saved).toEqual(["a1"]);
  });
  it("test mode: the robot is told dry_run and the result is Prepared", async () => {
    const m = memoryApplyStore([user([cand(job("1"))])]);
    const robot = robotSaying("ready");
    expect((await runApply({ store: m.store, mode: "dry_run", robot, now: () => T0 })).dryRun).toBe(1);
    expect(robot.mock.calls[0][0].mode).toBe("dry_run");
    expect(m.applications[0].status).toBe("dry_run");
  });
  it("hands the job back to the person with the robot's reason", async () => {
    const m = memoryApplyStore([user([cand(job("1"))])]);
    await runApply({ store: m.store, mode: "dry_run", robot: robotSaying("needs_user", "It needs your answer to: Portfolio link."), now: () => T0 });
    expect(m.applications[0]).toMatchObject({ status: "manual" });
    expect(m.notifications[0].message).toContain("Portfolio link");
  });
  it("never runs for a search without consent and auto-apply", async () => {
    const m = memoryApplyStore([user([cand(job("1"))], { auto_apply: false, consent_at: null })]);
    const robot = robotSaying("submitted");
    await runApply({ store: m.store, mode: "dry_run", robot, robotMode: "live", now: () => T0 });
    expect(robot).not.toHaveBeenCalled();
    expect(m.applications[0].status).toBe("manual");
  });
  it("skips jobs whose listed questions are sensitive, without opening the form", async () => {
    const m = memoryApplyStore([user([cand(job("1", { questions: ["disability_status"] }))])]);
    const robot = robotSaying("submitted");
    await runApply({ store: m.store, mode: "dry_run", robot, robotMode: "live", now: () => T0 });
    expect(robot).not.toHaveBeenCalled();
    expect(m.applications[0].status).toBe("skipped");
  });
  it("respects the daily limit", async () => {
    const m = memoryApplyStore([user([cand(job("1")), cand(job("2")), cand(job("3"))], { daily_limit: 2 })]);
    const robot = robotSaying("submitted");
    await runApply({ store: m.store, mode: "dry_run", robot, robotMode: "live", now: () => T0 });
    expect(robot).toHaveBeenCalledTimes(2);
  });
  it("a robot crash becomes Waiting for you, not a lost job", async () => {
    const m = memoryApplyStore([user([cand(job("1"))])]);
    const robot = vi.fn<Robot>(async () => { throw new Error("page timed out"); });
    await runApply({ store: m.store, mode: "dry_run", robot, now: () => T0 });
    expect(m.applications[0].status).toBe("manual");
  });
  it("never sends LinkedIn-style or non-web links to the robot", async () => {
    const m = memoryApplyStore([user([cand(job("1", { apply_url: "mailto:x@y.com" }))])]);
    const robot = robotSaying("submitted");
    await runApply({ store: m.store, mode: "dry_run", robot, now: () => T0 });
    expect(robot).not.toHaveBeenCalled();
  });
});

describe("form answerer", () => {
  const deps = (reply: string) => ({
    provider: { model: "m", completeJson: vi.fn(async () => ({ content: reply, promptTokens: 1, completionTokens: 1 })) },
    usage: { countToday: async () => 0, log: async () => {}, hasConsent: async () => true },
    dailyLimit: 100,
  });
  it("never asks the AI sensitive, personal, link or tick-box questions", async () => {
    const d = deps('{"answer":"x"}');
    const ask = makeAnswerer("u1", cv, {}, d);
    for (const q of ["Genderselect ...male", "Do you have a disability?", "What is your expected salary?", "Do you have a driving licence?", "Portfolio URL", "I have read the privacy notice", "What is your notice period?"]) {
      expect(await ask(q)).toBeNull();
    }
    expect(d.provider.completeJson).not.toHaveBeenCalled();
  });
  it("uses the AI's answer only when every number in it is on the CV", async () => {
    const facts = candidateFacts(cv, {});
    expect(numbersBacked("I have 99 years of experience", facts)).toBe(false);
    const ask = makeAnswerer("u1", cv, {}, deps('{"answer":"I have 99 years of Python experience."}'));
    expect(await ask("How many years of Python experience do you have?")).toBeNull();
    const ok = makeAnswerer("u1", cv, {}, deps('{"answer":"I build Django REST APIs."}'));
    expect(await ok("Describe your backend experience")).toBe("I build Django REST APIs.");
  });
  it("never sends contact details to the AI", () => {
    const facts = candidateFacts(cv, {});
    expect(facts).not.toContain(cv.email);
    expect(facts).not.toContain(cv.name);
  });
  it("always answers 'how did you hear' truthfully, without AI", () => {
    expect(buildFillData(cv, {}, { linkedin: "", github: "", website: "" }).answers.find((a) => a.key === "heard_about")?.answer).toBe("Online job search");
  });
});
