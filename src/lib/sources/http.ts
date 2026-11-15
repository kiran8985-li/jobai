import { SourceError, type Http } from "./types";

export type HttpDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minGapMs?: number;
  timeoutMs?: number;
};

/**
 * A JSON getter for ONE source. Being polite is built in: requests are spaced at least a second
 * apart and time out after 15 s. Errors carry only the status, never the URL (Adzuna's URL
 * contains the API key) or the response body.
 */
export function createHttp(deps: HttpDeps = {}): Http {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const minGap = deps.minGapMs ?? 1000;
  const timeout = deps.timeoutMs ?? 15_000;
  let nextSlot = 0;

  return async (url, init) => {
    const start = Math.max(now(), nextSlot);
    nextSlot = start + minGap;
    if (start > now()) await sleep(start - now());

    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: { accept: "application/json", "user-agent": "JobPilotAI/1.0 (job search service)", ...init?.headers },
        signal: AbortSignal.timeout(timeout),
        redirect: "follow",
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      throw new SourceError(name === "TimeoutError" || name === "AbortError" ? "Timed out" : "Could not connect");
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? " (check the API key)" : res.status === 404 ? " (not found)" : res.status === 429 ? " (rate limited)" : "";
      throw new SourceError(`HTTP ${res.status}${hint}`);
    }
    try {
      return await res.json();
    } catch {
      throw new SourceError("Reply was not valid JSON");
    }
  };
}
