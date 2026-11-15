import { describe, expect, it } from "vitest";
import { isSensitiveQuestion } from "@/lib/screening";
import { isAutoApplyOn, parseList, profileFormSchema } from "@/lib/search-profiles";

const valid = {
  name: "Python jobs", roles: "Python Developer, backend engineer", locations: "", min_salary: "", employment_types: [],
  keywords: "", exclude_keywords: "", min_match: "75", daily_limit: "10",
};

describe("search profile form", () => {
  it("accepts a minimal profile and cleans the lists", () => {
    const p = profileFormSchema.parse({ ...valid, roles: " Python Developer ,python developer;  Backend   Engineer\n", min_salary: "£45,000", employment_types: ["permanent", "contract"] });
    expect(p.roles).toEqual(["Python Developer", "Backend Engineer"]);
    expect(p.locations).toEqual([]);
    expect(p.min_salary).toBe(45000);
    expect(p.min_match).toBe(75);
  });
  it("leaves salary empty when not given", () => {
    expect(profileFormSchema.parse(valid).min_salary).toBeNull();
  });
  it.each([
    [{ roles: " , " }, /at least one job title/],
    [{ name: "" }, /name/],
    [{ min_match: "101" }, /between 0 and 100/],
    [{ min_match: "-5" }, /whole number/],
    [{ min_match: "7.5" }, /whole number/],
    [{ daily_limit: "0" }, /between 1 and 50/],
    [{ daily_limit: "500" }, /between 1 and 50/],
    [{ min_salary: "lots" }, /must be a number/],
    [{ employment_types: ["volunteer"] }, /Unknown job type/],
    [{ keywords: Array.from({ length: 16 }, (_, i) => `k${i}`).join(",") }, /15 or fewer/],
    [{ roles: "x".repeat(61) }, /under 60/],
  ])("rejects %j", (patch, message) => {
    const r = profileFormSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(message);
  });
  it("parseList handles empty input", () => {
    expect(parseList("")).toEqual([]);
  });
});

describe("isAutoApplyOn", () => {
  const on = { is_active: true, auto_apply: true, consent_at: "2026-01-01T00:00:00Z" };
  it("is on only when every condition holds", () => {
    expect(isAutoApplyOn(on, false)).toBe(true);
  });
  it("is off without consent, even if the switch says on", () => {
    expect(isAutoApplyOn({ ...on, consent_at: null }, false)).toBe(false);
  });
  it("is off when the switch is off, the search is paused, or everything is paused", () => {
    expect(isAutoApplyOn({ ...on, auto_apply: false }, false)).toBe(false);
    expect(isAutoApplyOn({ ...on, is_active: false }, false)).toBe(false);
    expect(isAutoApplyOn(on, true)).toBe(false);
  });
});

describe("sensitive questions", () => {
  it.each([
    "Do you consider yourself to have a disability?", "What is your ethnic origin?", "Do you have any health conditions?",
    "Do you have any unspent criminal convictions?", "What is your religion or belief?", "What is your sexual orientation?",
    "Have you ever been arrested?", "Are you pregnant?", "What is your gender?", "Do you hold a DBS certificate?", "ETHNICITY",
  ])("flags %s", (q) => expect(isSensitiveQuestion(q)).toBe(true));
  it.each([
    "Do you have the right to work in the UK?", "What is your notice period?", "Do you have a driving licence?",
    "Are you willing to relocate?", "How many years of Python experience do you have?", "Have you worked in healthcare software?",
    "Do you have experience with embraces of horse racecourses?",
  ])("allows %s", (q) => expect(isSensitiveQuestion(q)).toBe(false));
});
