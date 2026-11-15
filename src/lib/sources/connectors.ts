import { makeJob } from "./normalize";
import { SourceError, type JobSource, type NormalizedJob, type SourceQuery, type SourceResult } from "./types";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const message = (err: unknown) => (err instanceof SourceError ? err.message : "Unexpected error");
const keep = (jobs: (NormalizedJob | null)[]) => jobs.filter((j): j is NormalizedJob => j !== null);

/** Runs one request per query; a failed query is recorded and the rest still run. */
async function perQuery(queries: SourceQuery[], one: (q: SourceQuery) => Promise<NormalizedJob[]>): Promise<SourceResult> {
  const jobs: NormalizedJob[] = [];
  const errors: string[] = [];
  for (const q of queries) {
    try {
      jobs.push(...(await one(q)));
    } catch (err) {
      errors.push(message(err));
      // A bad key fails every query the same way: stop instead of repeating it.
      if (/HTTP 40[13]|HTTP 429/.test(message(err))) break;
    }
  }
  return { jobs, errors: [...new Set(errors)] };
}

export function adzuna(appId: string | undefined, appKey: string | undefined): JobSource {
  return {
    name: "adzuna",
    kind: "api",
    configured: () => Boolean(appId && appKey),
    fetch: (queries, http) =>
      perQuery(queries, async ({ query, location }) => {
        const params = new URLSearchParams({
          app_id: appId!, app_key: appKey!, results_per_page: "50", what: query, "content-type": "application/json", max_days_old: "14",
        });
        if (location) params.set("where", location);
        const data = rec(await http(`https://api.adzuna.com/v1/api/jobs/gb/search/1?${params}`));
        return keep(
          arr(data.results).map((x) => {
            const r = rec(x);
            return makeJob({
              source: "adzuna", external_id: r.id, title: r.title, company: rec(r.company).display_name, location: rec(r.location).display_name,
              salary_min: r.salary_min, salary_max: r.salary_max,
              employment_type: typeof r.contract_time === "string" ? r.contract_time.replace(/_/g, "-") : (r.contract_type ?? ""),
              description: r.description, apply_url: r.redirect_url, posted_at: r.created,
            });
          }),
        );
      }),
  };
}

export function reed(apiKey: string | undefined): JobSource {
  return {
    name: "reed",
    kind: "api",
    configured: () => Boolean(apiKey),
    fetch: (queries, http) =>
      perQuery(queries, async ({ query, location }) => {
        const params = new URLSearchParams({ keywords: query, resultsToTake: "50" });
        if (location) params.set("locationName", location);
        const auth = Buffer.from(`${apiKey}:`).toString("base64");
        const data = rec(await http(`https://www.reed.co.uk/api/1.0/search?${params}`, { headers: { authorization: `Basic ${auth}` } }));
        return keep(
          arr(data.results).map((x) => {
            const r = rec(x);
            return makeJob({
              source: "reed", external_id: r.jobId, title: r.jobTitle, company: r.employerName, location: r.locationName,
              salary_min: r.minimumSalary, salary_max: r.maximumSalary, description: r.jobDescription, apply_url: r.jobUrl, posted_at: r.date,
            });
          }),
        );
      }),
  };
}

/** True when a company-feed job mentions any word from any query (the feed returns every vacancy). */
export function matchesAnyQuery(job: NormalizedJob, queries: SourceQuery[]): boolean {
  if (!queries.length) return true;
  const hay = `${job.title} ${job.description.slice(0, 500)}`.toLowerCase();
  return queries.some(({ query }) => {
    const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    return words.length === 0 || words.some((w) => hay.includes(w));
  });
}

const titleCase = (token: string) => token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
// Board names go into a URL, so only plain tokens are accepted.
export const parseTokens = (list: string | undefined) =>
  [...new Set((list ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9][a-z0-9_-]{0,60}$/.test(s)))];

/** Runs one request per company board; a failing board is recorded and the rest still run. */
async function perBoard(boards: string[], queries: SourceQuery[], one: (board: string) => Promise<NormalizedJob[]>): Promise<SourceResult> {
  const jobs: NormalizedJob[] = [];
  const errors: string[] = [];
  for (const board of boards) {
    try {
      jobs.push(...(await one(board)).filter((j) => matchesAnyQuery(j, queries)));
    } catch (err) {
      errors.push(`${board}: ${message(err)}`);
    }
  }
  return { jobs, errors };
}

/** Public job-board feed: https://boards-api.greenhouse.io/v1/boards/<token>/jobs */
export function greenhouse(boardList: string | undefined): JobSource {
  const boards = parseTokens(boardList);
  return {
    name: "greenhouse",
    kind: "feed",
    configured: () => boards.length > 0,
    fetch: (queries, http) =>
      perBoard(boards, queries, async (board) => {
        const data = rec(await http(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`));
        return keep(
          arr(data.jobs).map((x) => {
            const r = rec(x);
            return makeJob({
              source: "greenhouse", external_id: `${board}:${r.id}`, title: r.title, company: titleCase(board), location: rec(r.location).name,
              description: r.content, apply_url: r.absolute_url, posted_at: r.updated_at,
            });
          }),
        );
      }),
  };
}

/** Public postings feed: https://api.lever.co/v0/postings/<company>?mode=json */
export function lever(companyList: string | undefined): JobSource {
  const companies = parseTokens(companyList);
  return {
    name: "lever",
    kind: "feed",
    configured: () => companies.length > 0,
    fetch: (queries, http) =>
      perBoard(companies, queries, async (company) => {
        const data = await http(`https://api.lever.co/v0/postings/${company}?mode=json`);
        return keep(
          arr(data).map((x) => {
            const r = rec(x);
            const cats = rec(r.categories);
            return makeJob({
              source: "lever", external_id: `${company}:${r.id}`, title: r.text, company: titleCase(company), location: cats.location,
              employment_type: cats.commitment, description: r.descriptionPlain ?? r.description, apply_url: r.hostedUrl ?? r.applyUrl,
              posted_at: r.createdAt,
            });
          }),
        );
      }),
  };
}

const DEMO_ROWS: [string, string, string, number, number, string, string, string][] = [
  ["Python Developer", "Fernhill Software", "Manchester", 45000, 60000, "permanent", "python flask sql postgresql docker aws git agile rest api testing", "careers@fernhill.example.com"],
  ["Senior Backend Engineer", "Calder Payments", "London", 70000, 90000, "permanent", "python django postgresql kubernetes aws terraform ci/cd microservices", "jobs@calder.example.com"],
  ["Data Analyst", "Harbourview Retail", "Leeds", 32000, 40000, "permanent", "sql excel power bi tableau data analysis stakeholder management", ""],
  ["Junior Web Developer", "Pixelmill Studio", "Remote", 28000, 34000, "permanent", "javascript html css react git agile", "hello@pixelmill.example.com"],
  ["DevOps Engineer", "Stonebridge Cloud", "Birmingham", 55000, 70000, "permanent", "aws docker kubernetes terraform linux ci/cd python", ""],
  ["Software Developer", "Wrenfield Health", "Manchester", 40000, 52000, "permanent", "python sql git agile testing rest api postgresql", "recruit@wrenfield.example.com"],
  ["Customer Support Advisor", "Bluebird Energy", "Glasgow", 24000, 27000, "permanent", "customer service communication microsoft office", "jobs@bluebird.example.com"],
  ["Accounts Assistant", "Marsh & Co", "Bristol", 25000, 29000, "permanent", "accounting excel sage xero bookkeeping", ""],
  ["Machine Learning Engineer", "Quanta Labs", "Cambridge", 65000, 85000, "permanent", "python machine learning pytorch tensorflow pandas numpy sql aws", ""],
  ["Python Developer (Contract)", "Redgate Media", "Manchester", 400, 500, "contract", "python flask aws docker sql", "contracts@redgate.example.com"],
  ["Project Manager", "Larkspur Construction", "Sheffield", 48000, 58000, "permanent", "project management stakeholder management agile jira", ""],
  ["QA Test Engineer", "Ironside Games", "Remote", 35000, 45000, "permanent", "testing selenium python jira agile", "qa-jobs@ironside.example.com"],
];
// Questions a form would ask; used later to exercise the skip-unknown-or-sensitive-question rule.
const DEMO_QUESTIONS: Record<string, string[]> = {
  "Software Developer": ["right_to_work", "notice_period"],
  "Python Developer": ["right_to_work", "salary_expectation"],
  "Senior Backend Engineer": ["right_to_work", "disability_status"],
};

/**
 * Offline sample vacancies so the product can be exercised end to end with no keys.
 * Descriptions are marked "[Demo vacancy]" and apply emails use the reserved example.com domain,
 * so nothing can reach a real employer.
 */
export function demo(enabled: boolean, now: () => number = Date.now): JobSource {
  return {
    name: "demo",
    kind: "feed",
    configured: () => enabled,
    fetch: async () => {
      // Posting times are anchored to the hour so repeated scans store identical rows.
      const base = Math.floor(now() / 3_600_000) * 3_600_000;
      const jobs = DEMO_ROWS.map(([title, company, location, min, max, type, skills, email], i) =>
        makeJob({
          source: "demo", external_id: `demo-${i}`, title, company, location, salary_min: min, salary_max: max, employment_type: type,
          description: `[Demo vacancy] ${title} at ${company}. We are looking for someone with experience in: ${skills.split(" ").join(", ")}. Please send your CV and a short cover note.`,
          apply_url: `https://example.com/jobs/${i}`, apply_email: email, questions: DEMO_QUESTIONS[title] ?? [],
          posted_at: new Date(base - i * 5 * 3_600_000).toISOString(),
        }),
      );
      return { jobs: keep(jobs), errors: [] };
    },
  };
}

export type SourceConfig = {
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
  REED_API_KEY?: string;
  GREENHOUSE_BOARDS?: string;
  LEVER_COMPANIES?: string;
  DEMO_SOURCE: boolean;
};

/** Every source the app knows. Adding a provider means adding it here and nowhere else. */
export function createSources(cfg: SourceConfig): JobSource[] {
  return [adzuna(cfg.ADZUNA_APP_ID, cfg.ADZUNA_APP_KEY), reed(cfg.REED_API_KEY), greenhouse(cfg.GREENHOUSE_BOARDS), lever(cfg.LEVER_COMPANIES), demo(cfg.DEMO_SOURCE)];
}
