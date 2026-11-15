import type { SourceQuery } from "../sources/types";

export const MAX_API_QUERIES_PER_RUN = 20;

/**
 * Merges every active search profile into the distinct (job title, location) searches to run.
 * Ten users looking for "Python Developer" in Manchester cost one request, not ten.
 * "Remote" is not a place the job APIs understand, so it becomes a UK-wide search.
 */
export function buildQueries(profiles: { roles: string[]; locations: string[] }[]): SourceQuery[] {
  const seen = new Map<string, SourceQuery>();
  for (const p of profiles) {
    const places = p.locations.map((l) => (/remote|anywhere|home/i.test(l) ? "" : l.trim()));
    for (const role of p.roles) {
      const query = role.replace(/\s+/g, " ").trim();
      if (!query) continue;
      for (const location of places.length ? places : [""]) {
        const key = `${query.toLowerCase()}|${location.toLowerCase()}`;
        if (!seen.has(key)) seen.set(key, { query, location });
      }
    }
  }
  return [...seen.values()].sort((a, b) => `${a.query}|${a.location}`.localeCompare(`${b.query}|${b.location}`));
}

/**
 * API sources get at most MAX_API_QUERIES_PER_RUN searches per run. When there are more,
 * each run takes the next slice, so every search is covered over a few runs.
 */
export function pickApiQueries(all: SourceQuery[], runIndex: number, max = MAX_API_QUERIES_PER_RUN): SourceQuery[] {
  if (all.length <= max) return all;
  const start = (runIndex * max) % all.length;
  return Array.from({ length: max }, (_, i) => all[(start + i) % all.length]);
}
