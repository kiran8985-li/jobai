import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/scan/auth";
import { buildQueries, pickApiQueries } from "@/lib/scan/queries";
import { runScan } from "@/lib/scan/run";
import { memoryStore } from "@/lib/scan/store";
import { demo } from "@/lib/sources/connectors";
import { makeJob } from "@/lib/sources/normalize";
import { SourceError, type JobSource, type SourceQuery } from "@/lib/sources/types";

const T0 = Date.parse("2026-11-15T09:00:00Z");
const profiles = [{ roles: ["Python Developer"], locations: ["Manchester"] }];

function fakeSource(name: string, kind: "feed" | "api", behaviour: (q: SourceQuery[]) => { jobs?: Parameters<typeof makeJob>[0][]; errors?: string[] } | never) {
  const calls: SourceQuery[][] = [];
  const source: JobSource = {
    name, kind, configured: () => true,
    fetch: async (q) => {
      calls.push(q);
      const r = behaviour(q);
      return { jobs: (r.jobs ?? []).map((j) => makeJob(j)!), errors: r.errors ?? [] };
    },
  };
  return { source, calls };
}
const noHttp = () => async () => ({});

describe("search queries", () => {
  it("merges every profile into distinct title and location pairs", () => {
    const q = buildQueries([
      { roles: ["Python Developer", "Backend Engineer"], locations: ["Manchester", "Remote"] },
      { roles: ["python developer "], locations: ["manchester"] },
      { roles: ["Data Analyst"], locations: [] },
      { roles: ["  "], locations: ["Leeds"] },
    ]);
    expect(q).toEqual([
      { query: "Backend Engineer", location: "" }, { query: "Backend Engineer", location: "Manchester" }, { query: "Data Analyst", location: "" },
      { query: "Python Developer", location: "" }, { query: "Python Developer", location: "Manchester" },
    ]);
  });
  it("caps API searches per run and rotates through the rest", () => {
    const all = Array.from({ length: 50 }, (_, i) => ({ query: `q${i}`, location: "" }));
    expect(pickApiQueries(all.slice(0, 5), 3)).toHaveLength(5);
    const seen = new Set<string>();
    for (let run = 0; run < 5; run++) for (const q of pickApiQueries(all, run)) seen.add(q.query);
    expect(pickApiQueries(all, 0)).toHaveLength(20);
    expect(seen.size).toBe(50);
  });
});

describe("scan pipeline", () => {
  it("with only the demo source, fills jobs; a second run adds no duplicates", async () => {
    const m = memoryStore();
    const opts = { store: m.store, sources: [demo(true, () => T0)], apiMinIntervalMin: 60, httpFor: noHttp, now: () => T0 };
    const first = await runScan(opts);
    expect(first).toMatchObject({ status: "done", newJobs: 12, totalFetched: 12 });
    expect(m.jobs.size).toBe(12);
    const second = await runScan({ ...opts, now: () => T0 + 15 * 60_000 });
    expect(second).toMatchObject({ status: "done", newJobs: 0, totalFetched: 12 });
    expect(m.jobs.size).toBe(12);
    expect(m.runs).toMatchObject([{ new_jobs: 12, error: null }, { new_jobs: 0, error: null }]);
    expect(m.runs.every((r) => r.finished_at)).toBe(true);
    expect(m.status.get("demo")).toMatchObject({ last_count: 12, last_error: null });
  });

  it("a source with a bad key records its error while the others still run", async () => {
    const m = memoryStore({ profiles });
    const bad = fakeSource("adzuna", "api", () => ({ errors: ["HTTP 401 (check the API key)"] }));
    const thrower = fakeSource("reed", "api", () => { throw new SourceError("boom with secret-url"); });
    const res = await runScan({ store: m.store, sources: [bad.source, thrower.source, demo(true, () => T0)], apiMinIntervalMin: 60, httpFor: noHttp, now: () => T0 });
    expect(res.status).toBe("done");
    expect(m.jobs.size).toBe(12);
    expect(m.status.get("adzuna")).toMatchObject({ last_error: "HTTP 401 (check the API key)", last_count: 0 });
    expect(m.status.get("reed")).toMatchObject({ last_error: "Unexpected error", last_count: 0 });
    expect(m.status.get("demo")).toMatchObject({ last_error: null, last_count: 12 });
    expect(res.sources.map((s) => `${s.name}:${s.state}`)).toEqual(["adzuna:failed", "reed:failed", "demo:ran"]);
    expect(m.runs[0].error).toBeNull();
  });

  it("merges the same vacancy from two sources and keeps the best way to apply", async () => {
    const m = memoryStore({ profiles });
    const base = { title: "Python Developer", company: "Fernhill Software Ltd", location: "Manchester, UK" };
    const reed = fakeSource("reed", "api", () => ({ jobs: [{ ...base, source: "reed", external_id: "r1", apply_url: "https://www.reed.co.uk/jobs/1" }] }));
    await runScan({ store: m.store, sources: [reed.source], apiMinIntervalMin: 60, httpFor: noHttp, now: () => T0 });
    expect([...m.jobs.values()]).toMatchObject([{ source: "reed", apply_method: "manual", also_on: [] }]);
    // Next scan the demo source has the same vacancy with an email address.
    const res = await runScan({ store: m.store, sources: [demo(true, () => T0)], apiMinIntervalMin: 60, httpFor: noHttp, now: () => T0 + 60_000 });
    expect(res.newJobs).toBe(11);
    expect(m.jobs.size).toBe(12);
    expect([...m.jobs.values()].find((j) => j.title === "Python Developer")).toMatchObject({ source: "demo", apply_method: "email", also_on: ["reed"] });
  });

  it("company feeds run every scan; API sources about hourly", async () => {
    const m = memoryStore({ profiles });
    const api = fakeSource("adzuna", "api", () => ({}));
    const feed = fakeSource("greenhouse", "feed", () => ({}));
    const at = (min: number) => runScan({ store: m.store, sources: [api.source, feed.source], apiMinIntervalMin: 60, httpFor: noHttp, now: () => T0 + min * 60_000 });
    for (const min of [0, 15, 30, 45, 60, 75]) await at(min);
    expect(feed.calls).toHaveLength(6);
    expect(api.calls).toHaveLength(2);
    expect((await at(90)).sources).toMatchObject([{ name: "adzuna", state: "not_due" }, { name: "greenhouse", state: "ran" }]);
  });

  it("skips sources that are switched off, not set up, or have nothing to search for", async () => {
    const m = memoryStore({ status: [{ name: "reed", enabled: false, last_run: null, last_count: null, last_error: null }] });
    const off = fakeSource("reed", "api", () => ({}));
    const unset: JobSource = { name: "lever", kind: "feed", configured: () => false, fetch: async () => { throw new Error("must not run"); } };
    const noSearches = fakeSource("greenhouse", "feed", () => ({}));
    const res = await runScan({ store: m.store, sources: [off.source, unset, noSearches.source, demo(true, () => T0)], apiMinIntervalMin: 60, httpFor: noHttp, now: () => T0 });
    expect(res.sources.map((s) => `${s.name}:${s.state}`)).toEqual(["reed:disabled", "lever:not_configured", "greenhouse:no_searches", "demo:ran"]);
    expect(off.calls).toHaveLength(0);
    expect(noSearches.calls).toHaveLength(0);
    expect(m.status.get("reed")?.enabled).toBe(false);
  });

  it("'run one source now' ignores the interval and leaves the others alone", async () => {
    const m = memoryStore({ profiles });
    const api = fakeSource("adzuna", "api", () => ({}));
    const feed = fakeSource("greenhouse", "feed", () => ({}));
    const opts = { store: m.store, sources: [api.source, feed.source], apiMinIntervalMin: 60, httpFor: noHttp };
    await runScan({ ...opts, now: () => T0 });
    await runScan({ ...opts, now: () => T0 + 60_000, only: "adzuna" });
    expect(api.calls).toHaveLength(2);
    expect(feed.calls).toHaveLength(1);
  });

  it("does not start while another scan is running, but recovers from a stuck one", async () => {
    const m = memoryStore();
    await m.store.startRun(new Date(T0).toISOString());
    const opts = { store: m.store, sources: [demo(true, () => T0)], apiMinIntervalMin: 60, httpFor: noHttp };
    expect((await runScan({ ...opts, now: () => T0 + 5 * 60_000 })).status).toBe("already_running");
    expect(m.jobs.size).toBe(0);
    expect((await runScan({ ...opts, now: () => T0 + 11 * 60_000 })).status).toBe("done");
  });

  it("passes the merged searches to the sources", async () => {
    const m = memoryStore({ profiles: [...profiles, { roles: ["Data Analyst"], locations: [] }] });
    const api = fakeSource("reed", "api", () => ({}));
    await runScan({ store: m.store, sources: [api.source], apiMinIntervalMin: 60, httpFor: noHttp, now: () => T0 });
    expect(api.calls[0]).toEqual([{ query: "Data Analyst", location: "" }, { query: "Python Developer", location: "Manchester" }]);
  });
});

describe("cron secret", () => {
  const secret = "a-long-random-secret-value-123";
  const h = (init: Record<string, string>) => new Headers(init);
  it("accepts the right secret in either header", () => {
    expect(isCronAuthorized(h({ authorization: `Bearer ${secret}` }), secret)).toBe(true);
    expect(isCronAuthorized(h({ "x-cron-secret": secret }), secret)).toBe(true);
  });
  it("refuses anything else", () => {
    expect(isCronAuthorized(h({}), secret)).toBe(false);
    expect(isCronAuthorized(h({ authorization: "Bearer wrong" }), secret)).toBe(false);
    expect(isCronAuthorized(h({ authorization: `Bearer ${secret}x` }), secret)).toBe(false);
    expect(isCronAuthorized(h({ authorization: secret }), secret)).toBe(false);
  });
  it("stays closed when no secret, or a weak one, is configured", () => {
    expect(isCronAuthorized(h({ authorization: "Bearer " }), undefined)).toBe(false);
    expect(isCronAuthorized(h({ authorization: "Bearer undefined" }), undefined)).toBe(false);
    expect(isCronAuthorized(h({ "x-cron-secret": "short" }), "short")).toBe(false);
  });
});
