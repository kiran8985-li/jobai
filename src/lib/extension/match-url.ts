/**
 * Which job a browser tab is on. Application pages usually sit under the advert's address
 * (Lever adds "/apply"; Greenhouse has moved between boards. and job-boards. hosts), so the
 * comparison is on a normalised host and path.
 */
const HOST_ALIASES: [RegExp, string][] = [
  [/^(boards|job-boards)\.(eu\.)?greenhouse\.io$/, "greenhouse.io"],
  [/^jobs\.(eu\.)?lever\.co$/, "lever.co"],
];

export function normaliseUrl(raw: string): { host: string; path: string } | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    let host = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const [re, alias] of HOST_ALIASES) if (re.test(host)) host = alias;
    const path = u.pathname.toLowerCase().replace(/\/+$/, "").replace(/\/(apply|application)$/, "");
    return { host, path: path || "/" };
  } catch {
    return null;
  }
}

/** True when the tab is the job's advert or its application page. */
export function sameJob(tabUrl: string, jobUrl: string): boolean {
  const a = normaliseUrl(tabUrl);
  const b = normaliseUrl(jobUrl);
  if (!a || !b || a.host !== b.host || b.path === "/") return false;
  return a.path === b.path || a.path.startsWith(b.path + "/");
}

/** Sites the extension must never work on (CLAUDE.md rule 4). Shared with extension/blocked.js. */
export const BLOCKED_HOSTS = ["linkedin.com", "indeed.com", "indeed.co.uk"];
export function isBlockedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    const host = u.hostname.toLowerCase();
    return BLOCKED_HOSTS.some((b) => host === b || host.endsWith("." + b));
  } catch {
    return true;
  }
}
