// Checks SIGNUP_MODE=open against a LOCAL Supabase: registration is public with no code change.
// Run with SIGNUP_MODE=open in .env.local and `npm run dev` restarted: node --env-file=.env.local tests/e2e/open-mode.cjs
const { chromium } = require("playwright");
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || "")) throw new Error("Refusing to run: not a local Supabase");
(async () => {
  const email = `open${String(Date.now()).slice(-6)}@example.com`;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
  await p.goto("http://localhost:3000/signup");
  const title = await p.textContent("h1");
  await p.screenshot({ path: process.env.SHOT || "/dev/null" }).catch(() => {});
  await p.fill('input[name="name"]', "Open User");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "correct-horse-battery-1");
  await p.click('button[type="submit"]');
  await Promise.race([p.waitForURL("**/verify-email**"), p.waitForSelector('form [role="alert"]')]);
  const ok = title.includes("Create your account") && p.url().includes("/verify-email");
  console.log(ok ? "PASS  open mode: anyone can register without an invite" : `FAIL  open mode  ${title} ${p.url()}`);
  await b.close();
  process.exit(ok ? 0 : 1);
})();
