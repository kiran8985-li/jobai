import "server-only";
import { env } from "../env";
import { createSources } from "../sources/connectors";
import { createSupabaseAdminClient } from "../supabase/admin";
import { runScan, type ScanResult } from "./run";
import { supabaseScanStore } from "./supabase-store";

/** The scan as the app runs it: real sources from the settings, real database. Used by the cron route and `npm run scan`. */
export function runConfiguredScan(opts: { only?: string; userId?: string } = {}): Promise<ScanResult> {
  const e = env();
  return runScan({
    store: supabaseScanStore(createSupabaseAdminClient()),
    sources: createSources(e),
    apiMinIntervalMin: e.API_SOURCES_MIN_INTERVAL_MIN,
    ...opts,
  });
}
