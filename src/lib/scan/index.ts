import "server-only";
import { env } from "../env";
import { runConfiguredMatching } from "../match";
import { createSources } from "../sources/connectors";
import { createSupabaseAdminClient } from "../supabase/admin";
import { tailorPendingMatches } from "../tailor/service";
import { runScan, type ScanResult } from "./run";
import { supabaseScanStore } from "./supabase-store";

/** The scan as the app runs it: real sources from the settings, real database. Used by the cron route and `npm run scan`. */
export function runConfiguredScan(opts: { only?: string; userId?: string } = {}): Promise<ScanResult> {
  const e = env();
  return runScan({
    store: supabaseScanStore(createSupabaseAdminClient()),
    sources: createSources(e),
    apiMinIntervalMin: e.API_SOURCES_MIN_INTERVAL_MIN,
    match: async () => {
      const matched = await runConfiguredMatching({ userId: opts.userId, ai: true });
      // Then prepare a tailored CV for each new match. A problem here must not hide the matches.
      try {
        await tailorPendingMatches({ userId: opts.userId, ai: true });
      } catch (err) {
        console.error("Tailoring stage failed:", err instanceof Error ? err.name : "error");
      }
      return matched?.newMatches ?? 0;
    },
    ...opts,
  });
}
