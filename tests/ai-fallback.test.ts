import { describe, expect, it, vi } from "vitest";
import { isTransient, withModelFallback } from "@/lib/ai/provider";

describe("withModelFallback", () => {
  it("uses the backup model when the main one is busy", async () => {
    const call = vi.fn(async (m: string) => {
      if (m === "main") throw Object.assign(new Error("busy"), { status: 503 });
      return "ok";
    });
    expect(await withModelFallback(["main", "backup"], call)).toEqual({ result: "ok", model: "backup" });
  });
  it("does not try the backup for a real error such as a bad key", async () => {
    const call = vi.fn(async () => { throw Object.assign(new Error("no"), { status: 401 }); });
    await expect(withModelFallback(["main", "backup"], call)).rejects.toThrow("no");
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("waits and retries once on the same model when rate-limited", async () => {
    let n = 0;
    const call = vi.fn(async (m: string) => {
      if (m === "main" && n++ === 0) throw Object.assign(new Error("slow down"), { status: 429, headers: { "retry-after": "3" } });
      return m;
    });
    const waits: number[] = [];
    expect(await withModelFallback(["main", "backup"], call, async (ms) => { waits.push(ms); })).toEqual({ result: "main", model: "main" });
    expect(waits).toEqual([3000]);
  });
  it("knows which errors are transient", () => {
    expect(isTransient({ status: 429 })).toBe(true);
    expect(isTransient({ status: 400 })).toBe(false);
    class APIConnectionTimeoutError extends Error {}
    expect(isTransient(new APIConnectionTimeoutError("Request timed out."))).toBe(true);
    expect(isTransient(new Error("bad json"))).toBe(false);
  });
});
