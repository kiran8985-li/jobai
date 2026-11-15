import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIUnavailable, chatJson, extractJson, type AIDeps, type UsageStore } from "@/lib/ai";
import type { AIProvider } from "@/lib/ai/provider";
import { parseCv } from "@/lib/cv/parse";
import { redact, restoreContact, scrubContact } from "@/lib/cv/redact";

const sample = readFileSync("reference/sample_cv.txt", "utf8");
const expected = JSON.parse(readFileSync("tests/fixtures/sample_cv.expected.json", "utf8"));

function fakeDeps(reply: unknown | (() => never), opts: { used?: number; limit?: number } = {}) {
  const sent: string[] = [];
  const logs: Parameters<UsageStore["log"]>[0][] = [];
  const provider: AIProvider = {
    model: "test-model",
    async completeJson({ system, user }) {
      sent.push(system, user);
      if (typeof reply === "function") (reply as () => never)();
      return { content: "```json\n" + JSON.stringify(reply) + "\n```", promptTokens: 100, completionTokens: 50 };
    },
  };
  const usage: UsageStore = { countToday: async () => opts.used ?? 0, log: async (e) => void logs.push(e) };
  const deps: AIDeps = { provider, usage, dailyLimit: opts.limit ?? 200 };
  return { deps, sent, logs };
}

// What a well-behaved model would return for the sample CV (contact fields left empty, as instructed).
const goodReply = { ...expected, name: "", email: "", phone: "", location: "", skills: expected.skills.slice(0, 8) };

describe("privacy: nothing personal reaches the AI", () => {
  it("no AI request contains the CV's name, email, phone or location", async () => {
    const { deps, sent } = fakeDeps(goodReply);
    await parseCv(sample, "user-1", deps);
    const all = sent.join("\n");
    expect(all).toContain("Northwind Digital Ltd"); // the CV itself was sent
    expect(all).not.toContain("priya.shah@example.com");
    expect(all).not.toMatch(/priya/i);
    expect(all).not.toMatch(/shah/i);
    expect(all).not.toContain("07700");
    expect(all).not.toContain("900123");
    expect(all).not.toContain("Manchester");
  });

  it("redacts details repeated in the body, links and postcodes", () => {
    const cv = [
      "Jane Q Public", "Engineer", "jane@mail.co.uk · +44 (0)7911 123456", "12 High Street, Leeds LS1 4AP", "linkedin.com/in/jane-public", "",
      "Profile", "Jane Q Public is an engineer. Call 020 7946 0958 or +1 415 555 0100, write to j.public@work.org.", "See https://janepublic.dev/portfolio",
      "Experience", "Engineer, Acme Ltd, 2014 - 2017", "- Cut costs by 30% for 1200 users",
    ].join("\n");
    const { text, contact } = redact(cv);
    for (const secret of ["Jane", "Public", "jane@", "j.public", "7911", "7946", "555 0100", "High Street", "LS1", "linkedin", "janepublic"]) {
      expect(text, secret).not.toContain(secret);
    }
    // Facts that are not personal survive untouched.
    expect(text).toContain("Engineer, Acme Ltd, 2014 - 2017");
    expect(text).toContain("Cut costs by 30% for 1200 users");
    expect(contact.email).toBe("jane@mail.co.uk");
  });

  it("the AI client scrubs emails and phones even if a caller forgets to redact", async () => {
    const { deps, sent } = fakeDeps({ ok: true });
    await chatJson({ system: "s", user: "Contact a.b@c.io on 07700 900123 or +44 20 7946 0958. Dates 2014 - 2017.", purpose: "t", userId: "u" }, deps);
    expect(sent[1]).toBe("Contact [EMAIL] on [PHONE] or [PHONE]. Dates 2014 - 2017.");
  });

  it("scrubContact leaves dates, salaries and figures alone", () => {
    const s = "Jun 2018 - Feb 2021, £45,000 - £55,000, 2 million requests, 2014 - 2017";
    expect(scrubContact(s)).toBe(s);
  });

  it("puts contact details back in code", () => {
    const c = { name: "Priya Shah", email: "p@x.com", phone: "07700 900123", location: "Manchester, UK" };
    expect(restoreContact("[NAME] | [EMAIL] | [PHONE] | [ADDRESS] [LINK]", c)).toBe("Priya Shah | p@x.com | 07700 900123 | Manchester, UK");
  });
});

describe("AI CV parsing", () => {
  it("returns the same structure as the reference, with contact details filled in by code", async () => {
    const { deps, logs } = fakeDeps(goodReply);
    const r = await parseCv(sample, "user-1", deps);
    expect(r.parsedBy).toBe("ai");
    expect(r.flags).toEqual([]);
    expect(r.profile).toEqual({ ...expected, skills: expected.skills.slice(0, 8) });
    expect(logs).toEqual([{ userId: "user-1", purpose: "cv_parse", model: "test-model", promptTokens: 100, completionTokens: 50, ok: true }]);
  });

  it("drops and flags anything the AI invented", async () => {
    const invented = structuredClone(goodReply);
    invented.name = "Someone Else";
    invented.email = "attacker@evil.example";
    invented.skills.push("Kubernetes", "Rust");
    invented.experience.push({ title: "CTO", company: "Google", dates: "2010 - 2018", bullets: ["Ran everything"] });
    invented.experience[0].bullets.push("Increased revenue by 500% across 12 countries");
    invented.experience[1].dates = "Jan 2010 - Feb 2021";
    invented.education.push({ degree: "PhD Physics", institution: "University of Oxford", dates: "2018" });
    invented.certifications.push("Certified Kubernetes Administrator");
    const { deps } = fakeDeps(invented);
    const r = await parseCv(sample, "user-1", deps);
    const json = JSON.stringify(r.profile);
    for (const fake of ["Kubernetes", "Rust", "Google", "CTO", "500%", "Oxford", "PhD", "Jan 2010", "Someone Else", "attacker"]) {
      expect(json, fake).not.toContain(fake);
    }
    expect(r.profile.name).toBe("Priya Shah");
    expect(r.profile.email).toBe("priya.shah@example.com");
    expect(r.profile.experience).toHaveLength(2);
    expect(r.profile.experience[0].bullets).toEqual(expected.experience[0].bullets);
    expect(r.flags).toHaveLength(7);
    expect(r.flags.join("\n")).toMatch(/Removed skill not found in your CV: Kubernetes/);
  });

  it("keeps real projects and drops an invented one", async () => {
    const cv = sample.replace("Skills\n", "Projects\nParcel Tracker | Python, Docker\n- Built a tracker used by 12 depots\n\nSkills\n");
    const reply = { ...goodReply, projects: [{ name: "Parcel Tracker", tech: "Python, Docker", bullets: ["Built a tracker used by 12 depots", "Won a national award"] }, { name: "Mars Rover", tech: "Rust", bullets: ["Landed it"] }] };
    const r = await parseCv(cv, "user-1", fakeDeps(reply).deps);
    expect(r.profile.projects).toEqual([{ name: "Parcel Tracker", tech: "Python, Docker", bullets: ["Built a tracker used by 12 depots"] }]);
    expect(r.flags.join("\n")).toMatch(/Removed project not found in your CV: Mars Rover/);
    expect(r.flags.join("\n")).toMatch(/Won a national award/);
  });

  it("falls back to the heuristic parser when there is no key", async () => {
    const r = await parseCv(sample, "user-1", { provider: null, usage: null, dailyLimit: 200 });
    expect(r).toEqual({ profile: expected, parsedBy: "heuristic", flags: [] });
  });

  it("falls back when the daily limit is reached, without calling the AI", async () => {
    const { deps, sent } = fakeDeps(goodReply, { used: 200, limit: 200 });
    const r = await parseCv(sample, "user-1", deps);
    expect(r.parsedBy).toBe("heuristic");
    expect(sent).toEqual([]);
  });

  it("falls back when the AI call fails or returns rubbish, and logs the failure", async () => {
    const failing = fakeDeps(() => {
      throw new Error("network down: prompt was ...");
    });
    expect((await parseCv(sample, "user-1", failing.deps)).parsedBy).toBe("heuristic");
    expect(failing.logs).toEqual([{ userId: "user-1", purpose: "cv_parse", model: "test-model", promptTokens: 0, completionTokens: 0, ok: false }]);
    const empty = fakeDeps({ skills: [], experience: [] });
    expect((await parseCv(sample, "user-1", empty.deps)).profile).toEqual(expected);
  });

  it("refuses to run without a usage log, so the daily limit can never be skipped", async () => {
    const { deps } = fakeDeps(goodReply);
    await expect(chatJson({ system: "s", user: "u", purpose: "t", userId: "u" }, { ...deps, usage: null })).rejects.toThrow(AIUnavailable);
  });
});

describe("extractJson", () => {
  it("copes with fences and chatter", () => {
    expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(() => extractJson("no json here")).toThrow();
  });
});
