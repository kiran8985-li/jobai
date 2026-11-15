// Builds the app with fake secret values and fails if any appear in browser bundles.
// Run: npm run check:secrets
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const fakes = {
  SUPABASE_SERVICE_ROLE_KEY: "LEAKCHECK_service_role_7f3a",
  DEEPSEEK_API_KEY: "LEAKCHECK_deepseek_91bc",
  RESEND_API_KEY: "LEAKCHECK_resend_44de",
  CRON_SECRET: "LEAKCHECK_cron_2a8f",
  ADZUNA_APP_KEY: "LEAKCHECK_adzuna_5c1e",
  REED_API_KEY: "LEAKCHECK_reed_8d0b",
};
execSync("npx next build", { stdio: "inherit", env: { ...process.env, ...fakes, CI: "1" } });

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const leaks = [];
for (const file of walk(".next/static")) {
  const text = readFileSync(file, "utf8");
  for (const [name, value] of Object.entries(fakes)) if (text.includes(value)) leaks.push(`${name} in ${file}`);
}
if (leaks.length) {
  console.error("SECRET LEAK in client bundle:\n  " + leaks.join("\n  "));
  process.exit(1);
}
console.log("check:secrets: no server secret found in .next/static");
