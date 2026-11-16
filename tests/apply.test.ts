import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildApplicationEmail, isReservedAddress } from "@/lib/apply/email";
import { checkQuestions } from "@/lib/apply/questions";
import { createResendSender } from "@/lib/apply/resend";
import { runApply, ukDayStart, type Sender } from "@/lib/apply/run";
import { memoryApplyStore, type ApplyCandidate, type ApplyJob, type ApplyUser } from "@/lib/apply/store";
import type { CvProfile } from "@/lib/cv/types";

const cv = JSON.parse(readFileSync("tests/fixtures/sample_cv.expected.json", "utf8")) as CvProfile;
const T0 = Date.parse("2026-11-16T10:00:00Z");

const job = (id: string, over: Partial<ApplyJob> = {}): ApplyJob => ({
  id, title: `Job ${id}`, company: "Acme Ltd", apply_url: `https://acme.co.uk/jobs/${id}`, apply_email: `jobs-${id}@acme.co.uk`, apply_method: "email", questions: [], ...over,
});
const cand = (j: ApplyJob, score = 90, profileId = "p1"): ApplyCandidate => ({ profileId, score, job: j, tailored: { content: cv, pdf_path: `u1/${j.id}.pdf` } });
const user = (candidates: ApplyCandidate[], over: Partial<ApplyUser> = {}, profile: Partial<ApplyUser["profiles"][number]> = {}): ApplyUser => ({
  userId: "u1", paused: false, answers: { right_to_work_uk: "yes", notice_period: "1 month" },
  profiles: [{ id: "p1", name: "Python jobs", min_match: 75, daily_limit: 10, auto_apply: true, consent_at: "2026-11-01T00:00:00Z", is_active: true, ...profile }],
  candidates, ...over,
});
function recorder(fail?: (to: string) => boolean) {
  const sent: { to: string; from: string; key: string; bytes: number }[] = [];
  const sender: Sender = async (email, attachment, key) => {
    if (fail?.(email.to)) throw new Error("Mail service answered HTTP 500");
    sent.push({ to: email.to, from: email.from, key, bytes: attachment.byteLength });
    return { id: `re_${sent.length}` };
  };
  return { sender, sent };
}
const live = (m: ReturnType<typeof memoryApplyStore>, sender: Sender | null, extra = {}) => runApply({ store: m.store, mode: "live", mailFrom: "applications@jobpilotai.co.uk", sender, now: () => T0, ...extra });

describe("screening questions: skip, don't guess", () => {
  const saved = { right_to_work_uk: "yes_sponsorship", notice_period: "1 month", "custom:Do you have a driving licence?": "Yes, full UK" };
  it("answers what the user saved, in plain words", () => {
    expect(checkQuestions(["right_to_work", "notice_period", "do you have a driving licence"], saved)).toEqual({
      ok: true,
      answers: [{ question: "Right to work in the UK", answer: "Yes, with visa sponsorship" }, { question: "Notice period", answer: "1 month" }, { question: "Do you have a driving licence", answer: "Yes, full UK" }],
    });
    expect(checkQuestions([], saved)).toEqual({ ok: true, answers: [] });
  });
  it("stops on a question with no saved answer", () => {
    const r = checkQuestions(["right_to_work", "salary_expectation", "Are you currently residing in Northern Ireland"], saved);
    expect(r).toMatchObject({ ok: false, kind: "unanswered", questions: ["Salary expectation", "Are you currently residing in Northern Ireland"] });
    if (!r.ok) expect(r.reason).toMatch(/have not answered yet/);
  });
  it("always stops on a sensitive question, even if an answer exists", () => {
    for (const q of ["disability_status", "What is your ethnic origin?", "Do you have any criminal convictions?", "religion", "sexual orientation", "Any health conditions we should know about?"]) {
      const r = checkQuestions(["right_to_work", q], { ...saved, [`custom:${q}`]: "No", disability_status: "No" });
      expect(r, q).toMatchObject({ ok: false, kind: "sensitive" });
    }
  });
  it("treats an empty saved answer as no answer", () => {
    expect(checkQuestions(["notice_period"], { notice_period: "  " }).ok).toBe(false);
  });
});

describe("application email", () => {
  const e = buildApplicationEmail(cv, { title: "Python Developer", company: "Fernhill Software", apply_email: "careers@fernhill.co.uk" }, [{ question: "Right to work in the UK", answer: "Yes" }]);
  it("is built only from the CV, the user's details and their saved answers", () => {
    expect(e.to).toBe("careers@fernhill.co.uk");
    expect(e.subject).toBe("Application for Python Developer - Priya Shah");
    expect(e.replyTo).toBe("priya.shah@example.com");
    expect(e.attachmentName).toBe("Priya-Shah-CV-Fernhill-Software.pdf");
    expect(e.body).toContain("I would like to apply for the Python Developer role at Fernhill Software.");
    expect(e.body).toContain(cv.summary);
    expect(e.body).toContain("- Right to work in the UK: Yes");
    expect(e.body).toMatch(/Kind regards,\nPriya Shah\n07700 900123\npriya\.shah@example\.com$/);
  });
  it("cannot be used to inject extra headers through a job title", () => {
    const bad = buildApplicationEmail(cv, { title: "Dev\r\nBcc: attacker@evil.example", company: "X", apply_email: "a@x.co.uk" }, []);
    expect(bad.subject).not.toMatch(/[\r\n]/);
  });
  it("knows test addresses that must never be mailed", () => {
    for (const a of ["careers@fernhill.example.com", "a@example.org", "a@something.test", "a@x.invalid", "a@localhost"]) expect(isReservedAddress(a), a).toBe(true);
    for (const a of ["jobs@acme.co.uk", "hr@examplecorp.com"]) expect(isReservedAddress(a), a).toBe(false);
  });
});

describe("apply engine: dry run", () => {
  it("prepares everything, stores it, sends nothing", async () => {
    const m = memoryApplyStore([user([cand(job("1")), cand(job("2", { apply_method: "ats", apply_email: "" })), cand(job("3", { apply_method: "manual", apply_email: "" }))])]);
    const { sender, sent } = recorder();
    const r = await runApply({ store: m.store, mode: "dry_run", sender, mailFrom: "x@jobpilotai.co.uk", now: () => T0 });
    expect(r).toEqual({ refused: null, dryRun: 1, sent: 0, failed: 0, skipped: 0, manual: 2 });
    expect(sent).toEqual([]);
    const a = m.applications.find((x) => x.job_id === "1")!;
    expect(a).toMatchObject({ status: "dry_run", method: "email", search_profile_id: "p1" });
    expect((a.detail.email as { to: string; body: string }).to).toBe("jobs-1@acme.co.uk");
    expect((a.detail.email as { body: string }).body).toContain("Job 1 role at Acme Ltd");
    expect(a.detail.note).toMatch(/nothing was sent/);
    expect(m.applications.filter((x) => x.status === "manual").map((x) => x.method)).toEqual(["ats", "manual"]);
    expect(m.notifications.map((n) => n.kind)).toEqual(["application_dry_run", "application_manual", "application_manual"]);
    expect(m.notifications[0].link).toBe("/jobs/1#apply");
  });

  it("running twice never duplicates an application or a notification", async () => {
    const m = memoryApplyStore([user([cand(job("1")), cand(job("2", { apply_method: "ats", apply_email: "" }))])]);
    await runApply({ store: m.store, mode: "dry_run", now: () => T0 });
    const again = await runApply({ store: m.store, mode: "dry_run", now: () => T0 + 60_000 });
    expect(again).toEqual({ refused: null, dryRun: 0, sent: 0, failed: 0, skipped: 0, manual: 0 });
    expect(m.applications).toHaveLength(2);
    expect(m.notifications).toHaveLength(2);
  });

  it("skips a job with a sensitive or unanswered question and tells the user why", async () => {
    const m = memoryApplyStore([user([cand(job("s", { title: "Senior Backend Engineer", questions: ["right_to_work", "disability_status"] })), cand(job("u", { questions: ["right_to_work", "salary_expectation"] })), cand(job("ok", { questions: ["right_to_work", "notice_period"] }))])]);
    const r = await runApply({ store: m.store, mode: "dry_run", now: () => T0 });
    expect(r).toMatchObject({ skipped: 2, dryRun: 1 });
    const by = (id: string) => m.applications.find((a) => a.job_id === id)!;
    expect(by("s")).toMatchObject({ status: "skipped", detail: { skip_kind: "sensitive" } });
    expect(by("u")).toMatchObject({ status: "skipped", detail: { skip_kind: "unanswered", unanswered: ["Salary expectation"] } });
    expect((by("ok").detail.email as { body: string }).body).toContain("- Notice period: 1 month");
    expect(m.notifications.find((n) => n.kind === "application_skipped")!.message).toMatch(/Not applied for Senior Backend Engineer at Acme Ltd\. This job asks a sensitive question \(Disability status\)/);
  });

  it("respects the daily limit, per search, and carries on the next day", async () => {
    const jobs = ["1", "2", "3", "4", "5"].map((id) => cand(job(id)));
    const m = memoryApplyStore([user(jobs, {}, { daily_limit: 2 })]);
    m.setClock(() => new Date(T0).toISOString());
    expect((await runApply({ store: m.store, mode: "dry_run", now: () => T0 })).dryRun).toBe(2);
    expect((await runApply({ store: m.store, mode: "dry_run", now: () => T0 + 3_600_000 })).dryRun).toBe(0);
    expect(m.applications.map((a) => a.job_id)).toEqual(["1", "2"]);
    const tomorrow = T0 + 24 * 3_600_000;
    m.setClock(() => new Date(tomorrow).toISOString());
    expect((await runApply({ store: m.store, mode: "dry_run", now: () => tomorrow })).dryRun).toBe(2);
    expect(m.applications).toHaveLength(4);
  });

  it("skipped and manual applications do not use up the daily limit", async () => {
    const m = memoryApplyStore([user([cand(job("s", { questions: ["religion"] })), cand(job("m", { apply_method: "ats", apply_email: "" })), cand(job("1")), cand(job("2"))], {}, { daily_limit: 1 })]);
    m.setClock(() => new Date(T0).toISOString());
    expect(await runApply({ store: m.store, mode: "dry_run", now: () => T0 })).toMatchObject({ skipped: 1, manual: 1, dryRun: 1 });
  });

  it("without consent or with auto-apply off, email jobs wait for the user instead", async () => {
    for (const profile of [{ auto_apply: false }, { consent_at: null }, { auto_apply: true, consent_at: null }]) {
      const m = memoryApplyStore([user([cand(job("1", { questions: ["salary_expectation"] }))], {}, profile)]);
      const r = await runApply({ store: m.store, mode: "dry_run", now: () => T0 });
      expect(r, JSON.stringify(profile)).toMatchObject({ manual: 1, dryRun: 0, skipped: 0 });
      expect(m.applications[0]).toMatchObject({ status: "manual", detail: { unanswered: ["Salary expectation"] } });
    }
  });

  it("while paused, automatic applications wait and manual ones are still prepared", async () => {
    const paused = [user([cand(job("1")), cand(job("2", { apply_method: "ats", apply_email: "" }))], { paused: true })];
    const m = memoryApplyStore(paused);
    expect(await runApply({ store: m.store, mode: "dry_run", now: () => T0 })).toMatchObject({ dryRun: 0, manual: 1 });
    paused[0].paused = false;
    expect(await runApply({ store: m.store, mode: "dry_run", now: () => T0 })).toMatchObject({ dryRun: 1, manual: 0 });
  });

  it("ignores matches below the minimum and inactive searches", async () => {
    const m = memoryApplyStore([user([cand(job("low"), 74), cand(job("other"), 99, "p2")], {}, {})]);
    m.store.listUsers = async () => [{ ...user([cand(job("low"), 74)]), profiles: [...user([]).profiles, { id: "p2", name: "x", min_match: 50, daily_limit: 5, auto_apply: true, consent_at: "2026-01-01", is_active: false }], candidates: [cand(job("low"), 74), cand(job("other"), 99, "p2")] }];
    expect(await runApply({ store: m.store, mode: "dry_run", now: () => T0 })).toEqual({ refused: null, dryRun: 0, sent: 0, failed: 0, skipped: 0, manual: 0 });
  });
});

describe("apply engine: live", () => {
  it("refuses to run without MAIL_FROM or a mail service, and applies for nothing", async () => {
    const { sender, sent } = recorder();
    for (const opts of [{ mailFrom: undefined, sender }, { mailFrom: "", sender }, { mailFrom: "a@jobpilotai.co.uk", sender: null }]) {
      const m = memoryApplyStore([user([cand(job("1")), cand(job("2", { apply_method: "ats", apply_email: "" }))])]);
      const r = await runApply({ store: m.store, mode: "live", now: () => T0, ...opts });
      expect(r.refused).toMatch(/MAIL_FROM or the mail service is not set up/);
      expect(m.applications).toEqual([]);
    }
    expect(sent).toEqual([]);
  });

  it("never sends without the user's consent on that search", async () => {
    const { sender, sent } = recorder();
    for (const profile of [{ consent_at: null }, { auto_apply: false }]) {
      const m = memoryApplyStore([user([cand(job("1"))], {}, profile)]);
      expect(await live(m, sender)).toMatchObject({ sent: 0, manual: 1 });
    }
    const paused = memoryApplyStore([user([cand(job("1"))], { paused: true })]);
    expect(await live(paused, sender)).toMatchObject({ sent: 0, manual: 0 });
    expect(sent).toEqual([]);
  });

  it("sends once with the CV attached, records it, and never sends again on a re-run", async () => {
    const m = memoryApplyStore([user([cand(job("1")), cand(job("2"))])]);
    const { sender, sent } = recorder();
    expect(await live(m, sender)).toMatchObject({ sent: 2, failed: 0 });
    expect(await live(m, sender)).toMatchObject({ sent: 0 });
    expect(sent).toEqual([
      { to: "jobs-1@acme.co.uk", from: "applications@jobpilotai.co.uk", key: "jobpilot-application-a1", bytes: 4 },
      { to: "jobs-2@acme.co.uk", from: "applications@jobpilotai.co.uk", key: "jobpilot-application-a2", bytes: 4 },
    ]);
    expect(m.applications.map((a) => [a.status, a.sent_at])).toEqual([["sent", "2026-11-16T10:00:00.000Z"], ["sent", "2026-11-16T10:00:00.000Z"]]);
    expect(m.notifications.map((n) => n.kind)).toEqual(["application_sent", "application_sent"]);
  });

  it("records a failed send, tells the user, and does not retry on its own", async () => {
    const m = memoryApplyStore([user([cand(job("1")), cand(job("2"))])]);
    const { sender, sent } = recorder((to) => to.includes("jobs-1"));
    expect(await live(m, sender)).toMatchObject({ sent: 1, failed: 1 });
    expect(m.applications[0]).toMatchObject({ status: "failed", detail: { error: "Mail service answered HTTP 500" } });
    expect(await live(m, recorder().sender)).toMatchObject({ sent: 0, failed: 0 });
    expect(sent.map((s) => s.to)).toEqual(["jobs-2@acme.co.uk"]);
    expect(m.notifications.map((n) => n.kind)).toEqual(["application_failed", "application_sent"]);
  });

  it("never mails a demo job's test address, even in live mode", async () => {
    const m = memoryApplyStore([user([cand(job("d", { apply_email: "careers@fernhill.example.com" }))])]);
    const { sender, sent } = recorder();
    expect(await live(m, sender)).toMatchObject({ sent: 0, dryRun: 1 });
    expect(sent).toEqual([]);
    expect(m.applications[0].detail.note).toMatch(/demo job/);
  });

  it("still skips sensitive and unanswered questions, and still respects the daily limit", async () => {
    const m = memoryApplyStore([user([cand(job("s", { questions: ["ethnicity"] })), cand(job("1")), cand(job("2")), cand(job("3"))], {}, { daily_limit: 2 })]);
    m.setClock(() => new Date(T0).toISOString());
    const { sender, sent } = recorder();
    expect(await live(m, sender)).toMatchObject({ skipped: 1, sent: 2 });
    expect(sent).toHaveLength(2);
  });
});

describe("Resend sender", () => {
  it("posts the email with the CV attached and an idempotency key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: "re_123" }), { status: 200 }); }) as unknown as typeof fetch;
    const send = createResendSender("re_key", fake)!;
    const out = await send({ to: "jobs@acme.co.uk", from: "applications@jobpilotai.co.uk", subject: "S", body: "B", replyTo: "me@mail.co.uk", attachmentName: "CV.pdf" }, new Uint8Array([1, 2, 3]), "key-1");
    expect(out).toEqual({ id: "re_123" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer re_key");
    expect(h["idempotency-key"]).toBe("key-1");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: "applications@jobpilotai.co.uk", to: ["jobs@acme.co.uk"], reply_to: "me@mail.co.uk", subject: "S", text: "B", attachments: [{ filename: "CV.pdf", content: "AQID" }] });
  });
  it("fails clearly, without echoing the key or the reply", async () => {
    const bad = (async () => new Response("invalid key re_key", { status: 401 })) as unknown as typeof fetch;
    await expect(createResendSender("re_key", bad)!({ to: "a@b.co", from: "f@x.co", subject: "s", body: "b", replyTo: "r@x.co", attachmentName: "c.pdf" }, new Uint8Array(1), "k")).rejects.toThrow(/^Mail service answered HTTP 401$/);
    expect(createResendSender(undefined)).toBeNull();
  });
});

describe("UK day start", () => {
  it("resets daily limits at midnight UK time, in winter and in summer", () => {
    expect(ukDayStart(Date.parse("2026-11-16T10:30:15Z"))).toBe("2026-11-16T00:00:00.000Z");
    expect(ukDayStart(Date.parse("2026-07-10T10:30:15Z"))).toBe("2026-07-09T23:00:00.000Z");
    expect(ukDayStart(Date.parse("2026-07-10T23:30:00Z"))).toBe("2026-07-10T23:00:00.000Z");
  });
});
