import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CvFileError, extractText } from "@/lib/cv/extract";
import { heuristicParse } from "@/lib/cv/heuristic";
import { canonical, findSkills } from "@/lib/skills";
import { normalizeProfile } from "@/lib/cv/types";
import { blankPdf, textToDocx, textToPdf } from "./helpers/make-cv-files";

const sample = readFileSync("reference/sample_cv.txt", "utf8");
// Produced by running the Python reference (reference/cvparse.py heuristic_parse) on sample_cv.txt.
const expected = JSON.parse(readFileSync("tests/fixtures/sample_cv.expected.json", "utf8"));
const enc = (s: string) => new TextEncoder().encode(s);

describe("heuristic parser matches the Python reference", () => {
  it("from the text file", async () => {
    const { text } = await extractText("cv.txt", enc(sample));
    expect(heuristicParse(text)).toEqual(expected);
  });
  it("from a PDF", async () => {
    const { text, kind } = await extractText("cv.pdf", await textToPdf(sample));
    expect(kind).toBe("pdf");
    expect(heuristicParse(text)).toEqual(expected);
  });
  it("from a Word file", async () => {
    const { text, kind } = await extractText("cv.docx", await textToDocx(sample));
    expect(kind).toBe("docx");
    expect(heuristicParse(text)).toEqual(expected);
  });
});

describe("file checks", () => {
  it("gives a clear message for a scanned PDF with no text", async () => {
    await expect(extractText("scan.pdf", await blankPdf())).rejects.toThrow(/no readable text.*scan/i);
  });
  it("rejects unsupported and disguised files", async () => {
    await expect(extractText("cv.exe", enc("MZ..."))).rejects.toThrow(CvFileError);
    await expect(extractText("cv.pdf", enc("<html>not a pdf</html>"))).rejects.toThrow(/not a PDF/);
    await expect(extractText("cv.docx", enc("plain text"))).rejects.toThrow(/not a Word/);
    await expect(extractText("cv.doc", enc("x"))).rejects.toThrow(/\.docx/);
    await expect(extractText("cv.txt", new Uint8Array(0))).rejects.toThrow(/empty/);
  });
  it("rejects files over 5 MB", async () => {
    await expect(extractText("cv.txt", new Uint8Array(5 * 1024 * 1024 + 1).fill(97))).rejects.toThrow(/5 MB/);
  });
  it("gives a clear message for a damaged PDF", async () => {
    await expect(extractText("cv.pdf", enc("%PDF-1.7 garbage"))).rejects.toThrow(/could not read this PDF/i);
  });
});

describe("heuristic parser edge cases", () => {
  it("handles a company-first layout and wrapped bullets", () => {
    const p = heuristicParse(
      ["Sam Jones", "", "Work Experience", "Acme Ltd", "Data Analyst", "01/2020 - Present", "• Built dashboards in Power BI", "for 12 teams", "", "Key Skills", "Excel; SQL"].join("\n"),
    );
    expect(p.experience).toEqual([
      { title: "Data Analyst", company: "Acme Ltd", dates: "01/2020 - Present", bullets: ["Built dashboards in Power BI for 12 teams"] },
    ]);
    expect(p.skills).toEqual(["Excel", "SQL", "power bi"]);
  });
  it("reads a Projects section: name, tools, and what was done", () => {
    const p = heuristicParse(
      ["Sam Jones", "", "Projects", "Yard Management System | Figma, Java, SQL", "- Designed dashboards for 500+ yards", "- Automated receipts, cutting processing time by 40%", "",
        "Campus Platform | PHP", "Built a multi-role system for students and recruiters.", "", "Skills", "Java"].join("\n"),
    );
    expect(p.projects).toEqual([
      { name: "Yard Management System", tech: "Figma, Java, SQL", bullets: ["Designed dashboards for 500+ yards", "Automated receipts, cutting processing time by 40%"] },
      { name: "Campus Platform", tech: "PHP", bullets: ["Built a multi-role system for students and recruiters."] },
    ]);
  });
  it("returns an empty but valid profile for text with no structure", () => {
    const p = heuristicParse("hello world");
    expect(p.experience).toEqual([]);
    expect(p.skills).toEqual([]);
    expect(p.name).toBe("hello world");
  });
});

describe("skills", () => {
  it("finds skills with awkward names and maps aliases", () => {
    expect(findSkills("C++, C# and .NET with Postgres on k8s")).toEqual(["c++", "c#", ".net", "postgresql", "kubernetes"]);
    expect(findSkills("javascript")).toEqual(["javascript"]);
    expect(findSkills("I enjoy java")).toEqual(["java"]);
    expect(canonical(" Postgres ")).toBe("postgresql");
    expect(canonical("Unknown Thing")).toBe("unknown thing");
  });
  it("does not match inside longer words", () => {
    expect(findSkills("javascripting excellence gitter")).toEqual([]);
  });
});

describe("normalizeProfile", () => {
  it("keeps related skills apart and removes only exact repeats", () => {
    const p = normalizeProfile({ skills: ["Figma", "Wireframing", "figma", "Git", "GitHub", " Git "] });
    expect(p.skills).toEqual(["Figma", "Wireframing", "Git", "GitHub"]);
  });
  it("reads projects and drops junk ones", () => {
    const p = normalizeProfile({ projects: [{ name: "Yard System", tech: ["Java", "SQL"], bullets: ["Did X", 5] }, { tech: "no name" }, "x"] });
    expect(p.projects).toEqual([{ name: "Yard System", tech: "Java, SQL", bullets: ["Did X"] }]);
  });
  it("drops junk fields", () => {
    const p = normalizeProfile({ name: 5, skills: ["Postgres", "", 7], experience: [{}, "x", { title: "Dev", bullets: ["a", 1] }], extra: "ignored" });
    expect(p.name).toBe("5");
    expect(p.skills).toEqual(["Postgres"]);
    expect(p.experience).toEqual([{ title: "Dev", company: "", dates: "", bullets: ["a"] }]);
    expect(Object.keys(p)).not.toContain("extra");
  });
});
