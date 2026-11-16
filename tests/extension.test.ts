import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOCKED_HOSTS, isBlockedUrl, normaliseUrl, sameJob } from "@/lib/extension/match-url";
import { linksFrom } from "@/lib/extension/payload";
import { isSensitiveQuestion } from "@/lib/screening";

describe("which job a tab is on", () => {
  it("matches the advert and its application page", () => {
    expect(sameJob("https://jobs.lever.co/zeta/abc-123/apply", "https://jobs.lever.co/zeta/abc-123")).toBe(true);
    expect(sameJob("https://job-boards.greenhouse.io/monzo/jobs/8281171?gh_src=x", "https://boards.greenhouse.io/monzo/jobs/8281171")).toBe(true);
    expect(sameJob("https://www.acme.co.uk/careers/42/", "https://acme.co.uk/careers/42")).toBe(true);
    expect(sameJob("https://boards.greenhouse.io/monzo/jobs/8281171#app", "https://boards.greenhouse.io/monzo/jobs/8281171")).toBe(true);
  });
  it("does not match a different job, company or site", () => {
    expect(sameJob("https://jobs.lever.co/zeta/abc-1234", "https://jobs.lever.co/zeta/abc-123")).toBe(false);
    expect(sameJob("https://jobs.lever.co/other/abc-123", "https://jobs.lever.co/zeta/abc-123")).toBe(false);
    expect(sameJob("https://evil.example/jobs.lever.co/zeta/abc-123", "https://jobs.lever.co/zeta/abc-123")).toBe(false);
    expect(sameJob("https://acme.co.uk/", "https://acme.co.uk/")).toBe(false);
    expect(sameJob("javascript:alert(1)", "https://acme.co.uk/x")).toBe(false);
    expect(normaliseUrl("not a url")).toBeNull();
  });
});

describe("blocked sites", () => {
  it("refuses LinkedIn and Indeed on every subdomain, and anything that is not a web page", () => {
    for (const u of ["https://www.linkedin.com/jobs/view/1", "https://linkedin.com", "https://uk.indeed.com/viewjob?jk=1", "https://www.indeed.co.uk/x", "chrome://settings", "file:///etc/passwd", "nonsense"]) {
      expect(isBlockedUrl(u), u).toBe(true);
    }
    for (const u of ["https://boards.greenhouse.io/x/jobs/1", "https://notlinkedin.com/x", "https://indeed.com.evil.example/x"]) {
      expect(isBlockedUrl(u), u).toBe(false);
    }
  });
  it("the extension blocks exactly the same sites as the app", () => {
    const ext = readFileSync("extension/blocked.js", "utf8");
    const fill = readFileSync("extension/fill.js", "utf8");
    const list = JSON.stringify(BLOCKED_HOSTS).replace(/"/g, '"');
    expect(ext).toContain(`BLOCKED_HOSTS = ${list.replace(/,/g, ", ")}`);
    expect(fill).toContain(`BLOCKED_HOSTS = ${list.replace(/,/g, ", ")}`);
  });
  it("the extension skips exactly the sensitive questions the app skips", () => {
    const fill = readFileSync("extension/fill.js", "utf8");
    const app = readFileSync("src/lib/screening.ts", "utf8");
    const pattern = (s: string) => /\/\\b\(disab[^\n]*?\)\\b\/i/.exec(s)?.[0];
    expect(pattern(fill)).toBeTruthy();
    expect(pattern(fill)).toBe(pattern(app));
    expect(isSensitiveQuestion("Veteran status")).toBe(true);
  });
});

describe("the extension never submits", () => {
  it("contains no click, submit or Enter key code", () => {
    const fill = readFileSync("extension/fill.js", "utf8").replace(/\/\/[^\n]*/g, "");
    expect(fill).not.toMatch(/\.submit\(|requestSubmit|\.click\(\)|dispatchEvent\(new (Mouse|Pointer|Keyboard)Event|key:\s*"Enter"/);
    expect(fill).not.toMatch(/new Event\("submit"/);
  });
  it("has no content script that runs on its own", () => {
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions.sort()).toEqual(["activeTab", "scripting", "storage"]);
  });
});

describe("links from the CV", () => {
  it("finds LinkedIn, GitHub and a personal site written in the CV", () => {
    expect(linksFrom("Priya Shah\nlinkedin.com/in/priya-shah-dev | github.com/priyashah | https://priya.dev/work\nExperience")).toEqual({
      linkedin: "https://linkedin.com/in/priya-shah-dev",
      github: "https://github.com/priyashah",
      website: "https://priya.dev/work",
    });
    expect(linksFrom("no links")).toEqual({ linkedin: "", github: "", website: "" });
  });
});
