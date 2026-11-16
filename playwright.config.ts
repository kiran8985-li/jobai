import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. They need a LOCAL Supabase (`npx supabase start`) and `.env.local` pointing at
 * it, with DEMO_SOURCE=true and a CRON_SECRET. They wipe and create users, so never point them at a
 * real project. See README.md, "Tests".
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    ...devices["Pixel 7"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 120_000 },
});
