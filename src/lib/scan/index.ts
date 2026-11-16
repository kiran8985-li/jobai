import "server-only";
import { runConfiguredApply } from "../apply";
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
      // Later stages must not hide the matches if they fail, and one must not stop the next.
      try {
        await tailorPendingMatches({ userId: opts.userId, ai: true });
      } catch (err) {
        console.error("Tailoring stage failed:", err instanceof Error ? err.name : "error");
      }
      let applications = 0;
      let applyNote: string | undefined;
      try {
        const applied = await runConfiguredApply({ userId: opts.userId });
        if (applied) {
          applications = applied.dryRun + applied.sent + applied.failed + applied.skipped + applied.manual;
          applyNote = applied.refused ?? undefined;
        }
      } catch (err) {
        console.error("Apply stage failed:", err instanceof Error ? err.name : "error");
        applyNote = "Applying failed";
      }
      return { newMatches: matched?.newMatches ?? 0, applications, applyNote };
    },
    ...opts,
  });
}
