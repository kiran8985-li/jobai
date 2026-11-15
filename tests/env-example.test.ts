import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serverEnvSchema } from "@/lib/env";

describe(".env.example", () => {
  it("lists exactly the settings the loader knows about", () => {
    const keys = readFileSync(".env.example", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map((l) => l.slice(0, l.indexOf("=")).trim())
      .sort();
    expect(keys).toEqual(Object.keys(serverEnvSchema.shape).sort());
  });
});
