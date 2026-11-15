/** The common job format every source is converted to. Matches the `jobs` table. */
export type ApplyMethod = "email" | "ats" | "manual";

export type NormalizedJob = {
  source: string;
  external_id: string;
  title: string;
  company: string;
  location: string;
  salary_min: number | null;
  salary_max: number | null;
  employment_type: string;
  description: string;
  apply_url: string;
  apply_email: string;
  apply_method: ApplyMethod;
  questions: string[];
  posted_at: string | null;
  dedupe_key: string;
  also_on: string[];
};

export type SourceQuery = { query: string; location: string };

/** Fetches JSON politely for one source: timeout, at most one request a second, safe error messages. */
export type Http = (url: string, init?: { headers?: Record<string, string> }) => Promise<unknown>;

export type SourceResult = { jobs: NormalizedJob[]; errors: string[] };

/**
 * One connector per provider. Only official APIs, public ATS job-board feeds and the demo source:
 * there is deliberately no LinkedIn or Indeed connector.
 *  - "feed" sources (company boards) run on every scan.
 *  - "api" sources (Adzuna, Reed) run about hourly to respect their limits.
 */
export interface JobSource {
  readonly name: string;
  readonly kind: "feed" | "api";
  configured(): boolean;
  fetch(queries: SourceQuery[], http: Http): Promise<SourceResult>;
}

/** A failure that is safe to store and show: never contains a URL, key or response body. */
export class SourceError extends Error {}
