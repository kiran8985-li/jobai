import { describe, expect, it } from "vitest";
import { adzuna, createSources, demo, greenhouse, lever, matchesAnyQuery, parseTokens, reed } from "@/lib/sources/connectors";
import { dedupeJobs, mergeJobs } from "@/lib/sources/dedupe";
import { createHttp } from "@/lib/sources/http";
import { applyMethodFor, dedupeKey, makeJob, stripHtml } from "@/lib/sources/normalize";
import type { Http, NormalizedJob } from "@/lib/sources/types";

const job = (over: Partial<Parameters<typeof makeJob>[0]> = {}) =>
  makeJob({ source: "reed", external_id: "1", title: "Python Developer", company: "Fernhill Software", location: "Manchester", ...over })!;

/** A fake HTTP layer: maps URL fragments to JSON replies and records every URL asked for. */
function fakeHttp(routes: Record<string, unknown>) {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const http: Http = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    for (const [fragment, reply] of Object.entries(routes)) {
      if (url.includes(fragment)) {
        if (reply instanceof Error) throw reply;
        return reply;
      }
    }
    throw new Error("unexpected url " + url);
  };
  return { http, calls };
}

describe("normalisation", () => {
  it("turns HTML into readable text", () => {
    expect(stripHtml("<p>Build <b>APIs</b> &amp; services</p><ul><li>Python</li><li>SQL</li></ul><script>alert(1)</script>")).toBe("Build APIs & services\nPython\nSQL");
    expect(stripHtml("&lt;p&gt;Escaped &amp;amp; nested&lt;/p&gt;&lt;p&gt;Second&lt;/p&gt;")).toBe("Escaped & nested\nSecond");
    expect(stripHtml(null)).toBe("");
  });
  it("cleans fields and rejects junk", () => {
    const j = makeJob({
      source: "x", external_id: 42, title: "  Senior   Dev ", company: null, location: undefined, salary_min: "45000", salary_max: 0,
      employment_type: "Full-Time", apply_url: "javascript:alert(1)", apply_email: "not-an-email", posted_at: "25/12/2026",
    })!;
    expect(j).toMatchObject({
      external_id: "42", title: "Senior Dev", company: "", location: "", salary_min: 45000, salary_max: null, employment_type: "full-time",
      apply_url: "", apply_email: "", apply_method: "manual", posted_at: "2026-12-25T00:00:00.000Z", also_on: [],
    });
    expect(makeJob({ source: "x", external_id: "", title: "T" })).toBeNull();
    expect(makeJob({ source: "x", external_id: "1", title: "  " })).toBeNull();
    expect(job({ posted_at: "nonsense" }).posted_at).toBeNull();
  });
  it("picks the apply method: email, then supported ATS, then manual", () => {
    expect(applyMethodFor("jobs@x.com", "https://boards.greenhouse.io/x/1")).toBe("email");
    expect(applyMethodFor("", "https://boards.greenhouse.io/x/1")).toBe("ats");
    expect(applyMethodFor("", "https://jobs.lever.co/x/1")).toBe("ats");
    expect(applyMethodFor("", "https://www.reed.co.uk/jobs/1")).toBe("manual");
    expect(applyMethodFor("", "https://notgreenhouse.io.evil.example/x")).toBe("manual");
    expect(applyMethodFor("", "")).toBe("manual");
  });
});

describe("dedupe key", () => {
  it("treats differently written copies of one vacancy as the same", () => {
    const a = dedupeKey("Python Developer", "Fernhill Software Ltd", "Manchester, UK");
    expect(dedupeKey("python developer", "Fernhill Software", "Manchester")).toBe(a);
    expect(dedupeKey("Python  Developer ", "FERNHILL SOFTWARE LIMITED", "Manchester, Greater Manchester")).toBe(a);
    expect(dedupeKey("Python Developer", "Fernhill Software", "Greater Manchester")).toBe(a);
  });
  it("keeps genuinely different vacancies apart", () => {
    const a = dedupeKey("Python Developer", "Fernhill Software", "Manchester");
    expect(dedupeKey("Python Developer (Contract)", "Fernhill Software", "Manchester")).not.toBe(a);
    expect(dedupeKey("Python Developer", "Fernhill Software", "Leeds")).not.toBe(a);
    expect(dedupeKey("Python Developer", "Redgate Media", "Manchester")).not.toBe(a);
    expect(dedupeKey("C++ Developer", "X", "Y")).not.toBe(dedupeKey("C# Developer", "X", "Y"));
    expect(dedupeKey("R&D Engineer", "Marsh & Co", "Bristol")).toBe(dedupeKey("R and D Engineer", "Marsh and Co", "Bristol"));
  });
});

describe("dedupe and merge", () => {
  const manual = job({ source: "reed", external_id: "r1", apply_url: "https://www.reed.co.uk/jobs/1" });
  const ats = job({ source: "greenhouse", external_id: "g1", company: "Fernhill Software Ltd", apply_url: "https://boards.greenhouse.io/fernhill/jobs/1" });
  const email = job({ source: "demo", external_id: "d1", location: "Manchester, UK", apply_email: "careers@fernhill.example.com" });

  it("keeps the easiest version to apply to, whatever order they arrive in", () => {
    for (const order of [[manual, ats, email], [email, manual, ats], [ats, email, manual]]) {
      const out = dedupeJobs(order);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ source: "demo", apply_method: "email", also_on: ["greenhouse", "reed"] });
    }
  });
  it("an existing job wins a tie, and a refresh from the same source updates it", () => {
    const other = job({ source: "adzuna", external_id: "a1" });
    expect(mergeJobs(manual, other)).toMatchObject({ source: "reed", also_on: ["adzuna"] });
    const refreshed = mergeJobs({ ...manual, also_on: ["adzuna"] }, { ...manual, description: "updated" });
    expect(refreshed).toMatchObject({ source: "reed", description: "updated", also_on: ["adzuna"] });
  });
  it("leaves different vacancies alone", () => {
    expect(dedupeJobs([manual, job({ external_id: "2", title: "Data Analyst" })])).toHaveLength(2);
  });
});

describe("connectors (mocked HTTP)", () => {
  const q = [{ query: "Python Developer", location: "Manchester" }];

  it("Adzuna maps its fields and sends the right search", async () => {
    const { http, calls } = fakeHttp({
      "api.adzuna.com": { results: [{ id: 99, title: "Python Dev", company: { display_name: "Acme" }, location: { display_name: "Manchester, UK" }, salary_min: 40000.4, salary_max: 50000, contract_time: "full_time", description: "<b>Great</b> job", redirect_url: "https://www.adzuna.co.uk/land/ad/99", created: "2026-11-01T10:00:00Z" }, { title: "no id" }] },
    });
    const res = await adzuna("ID", "KEY").fetch(q, http);
    expect(res.errors).toEqual([]);
    expect(res.jobs).toHaveLength(1);
    expect(res.jobs[0]).toMatchObject({ source: "adzuna", external_id: "99", title: "Python Dev", company: "Acme", location: "Manchester, UK", salary_min: 40000, employment_type: "full-time", description: "Great job", apply_method: "manual", posted_at: "2026-11-01T10:00:00.000Z" });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/api/jobs/gb/search/1");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ what: "Python Developer", where: "Manchester", app_id: "ID", results_per_page: "50" });
  });

  it("Reed maps its fields and authenticates with the key", async () => {
    const { http, calls } = fakeHttp({ "reed.co.uk": { results: [{ jobId: 7, jobTitle: "Backend Engineer", employerName: "Calder", locationName: "London", minimumSalary: 70000, maximumSalary: 90000, jobDescription: "Python", jobUrl: "https://www.reed.co.uk/jobs/7", date: "03/11/2026" }] } });
    const res = await reed("SECRETKEY").fetch(q, http);
    expect(res.jobs[0]).toMatchObject({ source: "reed", external_id: "7", title: "Backend Engineer", company: "Calder", salary_max: 90000, posted_at: "2026-11-03T00:00:00.000Z" });
    expect(calls[0].headers?.authorization).toBe("Basic " + Buffer.from("SECRETKEY:").toString("base64"));
    expect(calls[0].url).not.toContain("SECRETKEY");
  });

  it("Greenhouse reads each board, filters to the searches, and marks jobs as ATS", async () => {
    const { http, calls } = fakeHttp({
      "boards/acme-co/": { jobs: [
        { id: 1, title: "Python Developer", location: { name: "London" }, content: "&lt;p&gt;Django&lt;/p&gt;", absolute_url: "https://boards.greenhouse.io/acmeco/jobs/1", updated_at: "2026-11-02T09:00:00-05:00" },
        { id: 2, title: "Office Manager", location: { name: "London" }, content: "Admin", absolute_url: "https://boards.greenhouse.io/acmeco/jobs/2" },
      ] },
      "boards/broken/": new (await import("@/lib/sources/types")).SourceError("HTTP 404 (not found)"),
    });
    const res = await greenhouse("Acme-Co, broken, bad/../token").fetch(q, http);
    expect(calls.map((c) => c.url)).toEqual(["https://boards-api.greenhouse.io/v1/boards/acme-co/jobs?content=true", "https://boards-api.greenhouse.io/v1/boards/broken/jobs?content=true"]);
    expect(res.jobs).toHaveLength(1);
    expect(res.jobs[0]).toMatchObject({ source: "greenhouse", external_id: "acme-co:1", company: "Acme Co", description: "Django", apply_method: "ats" });
    expect(res.errors).toEqual(["broken: HTTP 404 (not found)"]);
  });

  it("Lever reads each company feed", async () => {
    const { http } = fakeHttp({ "postings/zeta": [{ id: "abc", text: "Python Engineer", categories: { location: "Remote", commitment: "Full-time" }, descriptionPlain: "APIs", hostedUrl: "https://jobs.lever.co/zeta/abc", createdAt: 1793000000000 }] });
    const res = await lever("zeta").fetch(q, http);
    expect(res.jobs[0]).toMatchObject({ source: "lever", external_id: "zeta:abc", company: "Zeta", location: "Remote", employment_type: "full-time", apply_method: "ats" });
    expect(res.jobs[0].posted_at).toMatch(/^2026-/);
  });

  it("copes with replies that are the wrong shape", async () => {
    for (const reply of [null, "oops", [], { results: "nope" }, { results: [null, 5, {}] }]) {
      const { http } = fakeHttp({ "api.adzuna.com": reply, "reed.co.uk": reply, "boards/a/": reply, "postings/a": reply });
      for (const s of [adzuna("i", "k"), reed("k"), greenhouse("a"), lever("a")]) {
        expect(await s.fetch(q, http)).toEqual({ jobs: [], errors: [] });
      }
    }
  });

  it("a bad key is reported once and stops further requests to that source", async () => {
    const { SourceError } = await import("@/lib/sources/types");
    const { http, calls } = fakeHttp({ "api.adzuna.com": new SourceError("HTTP 401 (check the API key)") });
    const res = await adzuna("i", "k").fetch([...q, { query: "Data Analyst", location: "" }, { query: "QA", location: "" }], http);
    expect(res).toEqual({ jobs: [], errors: ["HTTP 401 (check the API key)"] });
    expect(calls).toHaveLength(1);
  });

  it("demo source gives 12 marked sample jobs that cannot reach a real employer", async () => {
    const res = await demo(true, () => Date.parse("2026-11-15T09:20:00Z")).fetch([], async () => ({}));
    expect(res.jobs).toHaveLength(12);
    expect(res.jobs.every((j) => j.description.startsWith("[Demo vacancy]"))).toBe(true);
    expect(res.jobs.every((j) => !j.apply_email || j.apply_email.endsWith(".example.com"))).toBe(true);
    expect(res.jobs.filter((j) => j.apply_method === "email")).toHaveLength(7);
    expect(res.jobs.filter((j) => j.apply_method === "manual")).toHaveLength(5);
    expect(res.jobs[0]).toMatchObject({ title: "Python Developer", questions: ["right_to_work", "salary_expectation"], posted_at: "2026-11-15T09:00:00.000Z" });
    expect(new Set(res.jobs.map((j) => j.dedupe_key)).size).toBe(12);
  });

  it("only allowed sources exist, and each is off until set up", () => {
    const all = createSources({ DEMO_SOURCE: false });
    expect(all.map((s) => s.name)).toEqual(["adzuna", "reed", "greenhouse", "lever", "demo"]);
    expect(all.some((s) => /linkedin|indeed/i.test(s.name))).toBe(false);
    expect(all.filter((s) => s.configured())).toEqual([]);
    expect(adzuna("id", undefined).configured()).toBe(false);
    expect(parseTokens(" Acme , acme, ../etc, a b, ok_1 ")).toEqual(["acme", "ok_1"]);
  });

  it("feed filter keeps jobs that mention a search word", () => {
    const j = job({ title: "Platform Engineer", description: "Kubernetes and Python" }) as NormalizedJob;
    expect(matchesAnyQuery(j, [{ query: "Python Developer", location: "" }])).toBe(true);
    expect(matchesAnyQuery(j, [{ query: "Accountant", location: "" }])).toBe(false);
    expect(matchesAnyQuery(j, [])).toBe(true);
  });
});

describe("polite HTTP", () => {
  function setup(responses: (Response | Error)[]) {
    let t = 0;
    const sleeps: number[] = [];
    const urls: string[] = [];
    const http = createHttp({
      now: () => t,
      sleep: async (ms) => { sleeps.push(ms); t += ms; },
      fetchImpl: (async (url: string) => {
        urls.push(url);
        const r = responses.shift()!;
        if (r instanceof Error) throw r;
        return r;
      }) as unknown as typeof fetch,
    });
    return { http, sleeps, urls };
  }
  const ok = () => new Response(JSON.stringify({ a: 1 }), { status: 200 });

  it("spaces requests at least a second apart", async () => {
    const { http, sleeps } = setup([ok(), ok(), ok()]);
    await http("https://x.example/1");
    await http("https://x.example/2");
    await http("https://x.example/3");
    expect(sleeps).toEqual([1000, 1000]);
  });
  it("spaces requests that are started together", async () => {
    const { http, sleeps } = setup([ok(), ok(), ok()]);
    await Promise.all([http("https://x.example/1"), http("https://x.example/2"), http("https://x.example/3")]);
    // The test clock jumps forward on each wait, so two waits of 1 s put the requests at 0 s, 1 s and 2 s.
    expect(sleeps).toEqual([1000, 1000]);
  });
  it("never puts the URL, key or body in an error", async () => {
    const secretUrl = "https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=ID&app_key=SUPERSECRET";
    const cases: [Response | Error, string][] = [
      [new Response("invalid app_key SUPERSECRET", { status: 401 }), "HTTP 401 (check the API key)"],
      [new Response("x", { status: 429 }), "HTTP 429 (rate limited)"],
      [new Response("x", { status: 500 }), "HTTP 500"],
      [new Response("<html>", { status: 200 }), "Reply was not valid JSON"],
      [Object.assign(new Error(`fetch failed ${secretUrl}`), { name: "TypeError" }), "Could not connect"],
      [Object.assign(new Error("aborted"), { name: "TimeoutError" }), "Timed out"],
    ];
    for (const [response, expected] of cases) {
      const { http } = setup([response]);
      const err = await http(secretUrl).then(() => null, (e: Error) => e);
      expect(err?.message).toBe(expected);
      expect(String(err?.message) + String(err?.stack)).not.toContain("SUPERSECRET");
    }
  });
});
