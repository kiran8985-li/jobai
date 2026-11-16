// Sites the extension must never work on (JobPilot AI rule: no LinkedIn or Indeed automation).
// Keep in step with BLOCKED_HOSTS in src/lib/extension/match-url.ts (a test checks this).
export const BLOCKED_HOSTS = ["linkedin.com", "indeed.com", "indeed.co.uk"];

export function isBlockedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    const host = u.hostname.toLowerCase();
    return BLOCKED_HOSTS.some((b) => host === b || host.endsWith("." + b));
  } catch {
    return true;
  }
}
