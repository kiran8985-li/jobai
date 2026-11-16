// Runs one scan from the command line: npm run scan   (optionally: npm run scan -- adzuna)
// Same function the scheduler calls. Reads .env.local.
import { runConfiguredScan } from "../src/lib/scan";

async function main() {
  const only = process.argv[2];
  const result = await runConfiguredScan(only ? { only } : {});
  if (result.status === "already_running") {
    console.log("Another scan is still running. Try again in a few minutes.");
    return;
  }
  console.log(`Scan #${result.runId} finished: ${result.totalFetched} jobs fetched, ${result.newJobs} new, ${result.newMatches} new matches, ${result.applications} applications prepared or sent.`);
  if (result.applyNote) console.log(`  WARNING: ${result.applyNote}`);
  if (result.matchError) console.log(`  WARNING: ${result.matchError}`);
  const labels: Record<string, string> = {
    ran: "ok", failed: "FAILED", disabled: "switched off", not_configured: "not set up (no key)", not_due: "not due yet", no_searches: "skipped (no searches yet)",
  };
  for (const s of result.sources) {
    console.log(`  ${s.name.padEnd(11)} ${labels[s.state].padEnd(26)} ${s.state === "ran" || s.state === "failed" ? s.count + " jobs" : ""}${s.error ? "  error: " + s.error : ""}`);
  }
}

main().catch((err) => {
  console.error("Scan failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
