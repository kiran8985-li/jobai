import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { AIDeps, UsageStore } from "@/lib/ai";
import type { AIProvider } from "@/lib/ai/provider";
import { extractText } from "@/lib/cv/extract";
import type { CvProfile } from "@/lib/cv/types";
import { renderCvDocx } from "@/lib/render/docx";
import { cvFilename } from "@/lib/render/layout";
import { renderCvPdf } from "@/lib/render/pdf";
import { tailorCv, tailorPrompt } from "@/lib/tailor";
import { reorderOnly } from "@/lib/tailor/reorder";
import { bulletSupportedBy, numbers, validateTailored } from "@/lib/tailor/validate";

const master = JSON.parse(readFileSync("tests/fixtures/sample_cv.expected.json", "utf8")) as CvProfile;
const job = {
  title: "Senior Backend Engineer", company: "Calder Payments",
  description: "We need Docker and AWS experience, PostgreSQL, SQL reporting and automated testing with pytest. Kubernetes and Django are a plus.",
};
const clone = () => structuredClone(master);
const flat = (cv: CvProfile) => JSON.stringify(cv);

function fakeAI(reply: unknown) {
  const sent: string[] = [];
  const provider: AIProvider = { model: "test-model", async completeJson({ system, user }) { sent.push(system + "\n" + user); return { content: JSON.stringify(reply), promptTokens: 1, completionTokens: 1 }; } };
  const usage: UsageStore = { countToday: async () => 0, log: async () => {} };
  return { deps: { provider, usage, dailyLimit: 200 } as AIDeps, sent };
}

describe("validator: nothing invented survives", () => {
  it("removes a smuggled skill, employer and number, and flags each one", () => {
    const c = clone();
    c.skills = ["Kubernetes", "Python", "Rust", ...c.skills];
    c.experience.unshift({ title: "CTO", company: "Google", dates: "2010 - 2018", bullets: ["Ran a 500-person engineering organisation"] });
    c.experience[1].bullets = [
      "Reduced AWS costs by 80% by moving batch jobs to Docker on ECS", // number changed
      "Built REST APIs in Python and Flask serving 2 million requests per day", // untouched
      "Managed a £3m budget across 12 countries", // wholly invented
    ];
    c.summary = "Backend developer with 15 years of experience and deep Kubernetes expertise.";
    c.education = [{ degree: "PhD Computer Science", institution: "University of Oxford", dates: "2018" }];
    c.certifications = ["Certified Kubernetes Administrator"];
    c.name = "Someone Else";
    c.email = "attacker@evil.example";

    const { cv, flags, failedBadly } = validateTailored(c, master, job);
    const out = flat(cv);
    for (const fake of ["Kubernetes", "Rust", "Google", "CTO", "500", "80%", "£3m", "12 countries", "15 years", "Oxford", "PhD", "Someone Else", "attacker"]) {
      expect(out, fake).not.toContain(fake);
    }
    expect(cv.experience.map((e) => [e.title, e.company, e.dates])).toEqual(master.experience.map((e) => [e.title, e.company, e.dates]));
    expect(cv.experience[0].bullets).toEqual(["Built REST APIs in Python and Flask serving 2 million requests per day"]);
    expect(cv.summary).toBe(master.summary);
    expect(cv.education).toEqual(master.education);
    expect(cv.certifications).toEqual(master.certifications);
    expect([cv.name, cv.email, cv.phone, cv.location, cv.headline]).toEqual([master.name, master.email, master.phone, master.location, master.headline]);
    expect([...cv.skills].sort()).toEqual([...master.skills].sort());
    expect(flags.join("\n")).toMatch(/not on your master CV: Kubernetes/);
    expect(flags.join("\n")).toMatch(/not on your master CV: Rust/);
    expect(flags.join("\n")).toMatch(/job that is not on your master CV: CTO at Google/);
    expect(flags.join("\n")).toMatch(/does not support: Reduced AWS costs by 80%/);
    expect(flags.join("\n")).toMatch(/does not support: Managed a £3m budget/);
    expect(flags.join("\n")).toMatch(/Kept your original summary.*figure that is not on your CV \(15\)/);
    expect(flags.join("\n")).toMatch(/Ignored changes to your education/);
    expect(failedBadly).toBe(true);
  });

  it("accepts honest tailoring: reordered, selected and lightly reworded", () => {
    const c = clone();
    c.skills = ["Docker", "AWS", "PostgreSQL", "SQL"];
    c.experience[0].bullets = ["Cut AWS costs by 30% by moving batch jobs to Docker on ECS", "Built REST APIs in Python and Flask, serving 2 million requests per day"];
    c.experience[1].bullets = ["Automated testing with pytest, cutting release time by 40%"];
    c.summary = "Backend developer with 5 years of experience building Python web services and data pipelines, seeking a Senior Backend Engineer role at Calder Payments.";
    const { cv, flags, failedBadly } = validateTailored(c, master, job);
    expect(flags).toEqual([]);
    expect(failedBadly).toBe(false);
    expect(cv.skills.slice(0, 4)).toEqual(["Docker", "AWS", "PostgreSQL", "SQL"]);
    expect(cv.skills).toHaveLength(master.skills.length);
    expect(cv.experience[0].bullets).toEqual(c.experience[0].bullets);
    expect(cv.experience[1].bullets).toEqual(c.experience[1].bullets);
    expect(cv.summary).toBe(c.summary);
  });

  it("judges each bullet against its own job only", () => {
    expect(bulletSupportedBy("Mentored 3 junior developers", "Mentored 3 junior developers")).toBe(true);
    expect(bulletSupportedBy("Mentored three junior developers", "Mentored 3 junior developers")).toBe(true);
    expect(bulletSupportedBy("Mentored 5 junior developers", "Mentored 3 junior developers")).toBe(false);
    expect(bulletSupportedBy("Mentored 3 junior developers in Kubernetes", "Mentored 3 junior developers")).toBe(false);
    expect(bulletSupportedBy("Led a company-wide cloud migration programme", "Mentored 3 junior developers")).toBe(false);
    expect(bulletSupportedBy("", "Mentored 3 junior developers")).toBe(false);
    // A true bullet moved under the wrong employer is not accepted there.
    const c = clone();
    c.experience[1].bullets = ["Mentored 3 junior developers"];
    const { cv, flags } = validateTailored(c, master, job);
    expect(cv.experience[1].bullets).toEqual(master.experience[1].bullets);
    expect(flags).toHaveLength(1);
  });

  it("does not let one master bullet back two tailored bullets", () => {
    const c = clone();
    c.experience[0].bullets = ["Mentored 3 junior developers", "Mentored 3 junior developers"];
    expect(validateTailored(c, master, job).cv.experience[0].bullets).toEqual(["Mentored 3 junior developers"]);
  });

  it("rejects a summary that names a skill or makes claims the CV does not", () => {
    for (const summary of ["Backend developer experienced in Python and Django.", "Award-winning architect who founded three startups and managed global offshore divisions."]) {
      const c = clone();
      c.summary = summary;
      const r = validateTailored(c, master, job);
      expect(r.cv.summary, summary).toBe(master.summary);
      expect(r.flags.join()).toMatch(/Kept your original summary/);
    }
  });

  it("lets the summary name the job and employer applied to, without treating them as skill claims", () => {
    const logistics = { title: "Kubernetes Platform Engineer", company: "Larkfield Logistics" };
    const ok = clone();
    ok.summary = "Backend developer with 5 years of experience building Python web services, seeking the Kubernetes Platform Engineer role at Larkfield Logistics.";
    expect(validateTailored(ok, master, logistics)).toMatchObject({ flags: [], cv: { summary: ok.summary } });
    // Claiming the skill itself is still caught.
    const bad = clone();
    bad.summary = "Backend developer with strong Kubernetes and logistics experience, seeking the Kubernetes Platform Engineer role at Larkfield Logistics.";
    const r = validateTailored(bad, master, logistics);
    expect(r.cv.summary).toBe(master.summary);
    expect(r.flags.join()).toMatch(/skill that is not on your CV/);
  });

  it("reads figures consistently", () => {
    expect(numbers("Cut costs by 30 % and £40k, serving 2 million users on Python 3.12")).toEqual(["30%", "40k", "2", "3.12"]);
    expect(numbers("no figures")).toEqual([]);
  });

  it("a candidate equal to the master passes untouched", () => {
    expect(validateTailored(clone(), master, job)).toEqual({ cv: master, flags: [], failedBadly: false });
  });
});

describe("reorder-only tailoring (no AI)", () => {
  it("moves wanted skills and relevant bullets up without changing a word", () => {
    const out = reorderOnly(master, job);
    expect(out.skills.slice(0, 4).sort()).toEqual(["AWS", "Docker", "PostgreSQL", "SQL"].sort());
    expect([...out.skills].sort()).toEqual([...master.skills].sort());
    expect(out.experience[0].bullets[0]).toBe("Reduced AWS costs by 30% by moving batch jobs to Docker on ECS");
    for (let i = 0; i < master.experience.length; i++) {
      expect([...out.experience[i].bullets].sort()).toEqual([...master.experience[i].bullets].sort());
    }
    expect(out.summary).toBe(master.summary);
    expect(validateTailored(out, master, job).flags).toEqual([]);
    expect(master.skills[0]).toBe("Python"); // the master itself is not changed
  });
});

describe("tailorCv", () => {
  const goodReply = {
    summary: "Backend developer with 5 years of experience building Python web services and data pipelines.",
    skills: ["AWS", "Docker", "PostgreSQL"],
    experience: [
      { id: "E1", bullets: ["Reduced AWS costs by 30% by moving batch jobs to Docker on ECS", "Built REST APIs in Python and Flask serving 2 million requests per day", "Launched a blockchain platform used by 9 banks"] },
      { id: "E2", bullets: ["Automated testing with pytest, cutting release time by 40%", "Developed SQL reporting pipelines in PostgreSQL"] },
    ],
  };

  it("uses the AI's version after the fact check, dropping the one invented bullet", async () => {
    const ai = fakeAI(goodReply);
    const r = await tailorCv(master, job, "u1", ai.deps);
    expect(r.method).toBe("ai");
    expect(r.flags).toEqual(["Removed a bullet your master CV does not support: Launched a blockchain platform used by 9 banks"]);
    expect(flat(r.content)).not.toContain("blockchain");
    expect(r.content.skills.slice(0, 3)).toEqual(["AWS", "Docker", "PostgreSQL"]);
    expect(r.content.experience[0].bullets).toHaveLength(2);
    expect(r.content.experience[0].company).toBe("Northwind Digital Ltd");
  });

  it("never sends the name, contact details, employers or education to the AI", async () => {
    const ai = fakeAI(goodReply);
    await tailorCv(master, job, "u1", ai.deps);
    const all = ai.sent.join("\n");
    expect(all).toContain("Reduced AWS costs by 30%");
    for (const secret of ["Priya", "Shah", "priya.shah", "07700", "Manchester", "Northwind", "Brightside", "University of Leeds"]) expect(all, secret).not.toContain(secret);
    expect(tailorPrompt(master, job)).toContain('"id":"E1"');
  });

  it("falls back to reorder-only when the AI invents too much", async () => {
    const ai = fakeAI({ summary: "x", skills: ["Kubernetes", "Rust", "Go"], experience: [{ id: "E9", title: "CTO", company: "Google", bullets: ["Ran everything"] }, { id: "E1", bullets: ["Built a rocket", "Cured a disease"] }] });
    const r = await tailorCv(master, job, "u1", ai.deps);
    expect(r.method).toBe("reorder");
    expect(r.flags[0]).toMatch(/discarded/);
    expect(r.flags.join("\n")).toMatch(/Google/);
    expect([...r.content.experience.flatMap((e) => e.bullets)].sort()).toEqual([...master.experience.flatMap((e) => e.bullets)].sort());
    expect(flat(r.content)).not.toMatch(/Google|Kubernetes|rocket/);
  });

  it("falls back to reorder-only with no AI, a failing AI, or a nonsense reply", async () => {
    const none = await tailorCv(master, job, "u1", null);
    expect(none).toMatchObject({ method: "reorder", flags: [] });
    const down = await tailorCv(master, job, "u1", { provider: null, usage: null, dailyLimit: 1 });
    expect(down.method).toBe("reorder");
    const nonsense = await tailorCv(master, job, "u1", fakeAI("just a string").deps);
    expect(nonsense.content.experience).toEqual(master.experience);
    expect(nonsense.content.summary).toBe(master.summary);
  });
});

describe("PDF and Word files", () => {
  const norm = (s: string) => s.replace(/\s+/g, " ");
  const everything = [master.name, master.email, master.phone, master.headline, "Summary", "Skills", "Experience", "Education", "Certifications", master.summary,
    ...master.experience.flatMap((e) => [e.title, e.company, e.dates, ...e.bullets]), master.education[0].degree, master.education[0].institution, ...master.certifications, master.skills.join(", ")];

  it("PDF opens, is one A4 page, and its text can be extracted back out", async () => {
    const bytes = await renderCvPdf(master);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("CV - Priya Shah");
    const { text } = await extractText("cv.pdf", bytes);
    for (const piece of everything) expect(norm(text), piece).toContain(norm(piece));
    expect(bytes.byteLength).toBeLessThan(200_000);
  });

  it("Word file opens and contains everything", async () => {
    const bytes = await renderCvDocx(master);
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const { text } = await extractText("cv.docx", bytes);
    for (const piece of everything) expect(norm(text), piece).toContain(norm(piece));
  });

  it("a long CV flows onto more pages without losing text", async () => {
    const long = clone();
    long.experience = Array.from({ length: 12 }, (_, i) => ({ title: `Role ${i}`, company: `Employer ${i}`, dates: `20${10 + i} - 20${11 + i}`, bullets: Array.from({ length: 6 }, (_, j) => `Delivered project ${i}-${j} with a measurable result for the wider business and its customers`) }));
    const bytes = await renderCvPdf(long);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    const { text } = await extractText("cv.pdf", bytes);
    expect(norm(text)).toContain("Delivered project 0-0");
    expect(norm(text)).toContain("Delivered project 11-5");
    expect((norm(text).match(/Delivered project/g) ?? []).length).toBe(72);
  });

  it("copes with accents, unusual characters, very long words and empty sections", async () => {
    const odd = clone();
    odd.name = "Zoë Łukasiewicz-Çelik";
    odd.summary = "Résumé — “quoted” café £50k 😀 " + "x".repeat(300);
    odd.education = [];
    odd.certifications = [];
    odd.experience[0].bullets = [];
    const pdf = await renderCvPdf(odd);
    const { text } = await extractText("cv.pdf", pdf);
    expect(text).toContain("Zoë Łukasiewicz-Çelik");
    expect(text).toContain("café £50k");
    expect(text).not.toContain("Education");
    const docx = await extractText("cv.docx", await renderCvDocx(odd));
    expect(docx.text).toContain("Zoë Łukasiewicz-Çelik");
  });

  it("makes safe download names", () => {
    expect(cvFilename(master, "pdf", "Marsh & Co / ../etc")).toBe("Priya-Shah-CV-Marsh-Co-etc.pdf");
    expect(cvFilename({ ...master, name: "" }, "docx")).toBe("CV-CV.docx");
  });
});
