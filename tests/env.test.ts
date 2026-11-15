import { describe, expect, it } from "vitest";
import { EnvError, hasAI, parseServerEnv } from "@/lib/env";

describe("env loader", () => {
  it("works with no settings at all, using safe defaults", () => {
    const e = parseServerEnv({});
    expect(e.APPLY_MODE).toBe("dry_run");
    expect(e.SIGNUP_MODE).toBe("invite");
    expect(e.DEFAULT_MIN_MATCH).toBe(75);
    expect(e.DEFAULT_DAILY_LIMIT).toBe(10);
    expect(e.DEMO_SOURCE).toBe(true);
    expect(e.DEEPSEEK_BASE_URL).toBe("https://api.deepseek.com");
    expect(hasAI(e)).toBe(false);
  });

  it("treats empty strings as unset", () => {
    const e = parseServerEnv({ DEEPSEEK_API_KEY: "", APPLY_MODE: "" });
    expect(e.DEEPSEEK_API_KEY).toBeUndefined();
    expect(e.APPLY_MODE).toBe("dry_run");
  });

  it("rejects bad values with a clear message naming the setting", () => {
    expect(() => parseServerEnv({ APPLY_MODE: "yes" })).toThrow(EnvError);
    expect(() => parseServerEnv({ APPLY_MODE: "yes" })).toThrow(/APPLY_MODE/);
    expect(() => parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parseServerEnv({ DEFAULT_MIN_MATCH: "150" })).toThrow(/DEFAULT_MIN_MATCH/);
    expect(() => parseServerEnv({ DEMO_SOURCE: "maybe" })).toThrow(/DEMO_SOURCE/);
  });

  it("needs both key and model before AI counts as configured", () => {
    expect(hasAI(parseServerEnv({ DEEPSEEK_API_KEY: "k" }))).toBe(false);
    expect(hasAI(parseServerEnv({ DEEPSEEK_API_KEY: "k", DEEPSEEK_MODEL: "m" }))).toBe(true);
  });
});
