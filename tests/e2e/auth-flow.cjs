// End-to-end check of Prompt 1 against a LOCAL Supabase (npx supabase start) and `npm run dev`.
// Run: node tests/e2e/auth-flow.cjs      (never point this at a real project: it creates users)
const { chromium } = require("playwright");
const { execSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");

const APP = "http://localhost:3000";
const MAIL = "http://127.0.0.1:54324";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/127\.0\.0\.1|localhost/.test(SUPA || "")) throw new Error("Refusing to run: not a local Supabase");

const run = String(Date.now()).slice(-6);
const addr = (n) => `${n}${run}@example.com`;
const PW = "correct-horse-battery-1";
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};
const sql = (q) => execSync(`psql "${DB}" -Atc "${q}"`).toString().trim();
const invite = (email) => {
  const out = execSync(`npm run -s invite -- ${email}`).toString();
  return out.match(/http\S+/)[0];
};
async function verifyLink(email) {
  for (let i = 0; i < 20; i++) {
    const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
    if (r.messages?.length) {
      const m = await (await fetch(`${MAIL}/api/v1/message/${r.messages[0].ID}`)).json();
      const link = (m.HTML || m.Text).match(/https?:\/\/[^\s"'<]+verify[^\s"'<]+/);
      if (link) return link[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no verification email for " + email);
}
async function signUp(page, link, { email, name = "Test User" } = {}) {
  await page.goto(link);
  await page.fill('input[name="name"]', name);
  if (email) {
    // Simulates someone editing the locked email field in their browser.
    await page.evaluate(() => document.querySelector('input[name="email"]').removeAttribute("readonly"));
    await page.fill('input[name="email"]', email);
  }
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  // Either we move to the verify page or the form shows an error.
  await Promise.race([
    page.waitForURL("**/verify-email**"),
    page.waitForSelector('form [role="alert"]'),
  ]);
}
const formError = async (page) => ((await page.locator('form [role="alert"]').count()) ? page.textContent('form [role="alert"]') : "");
async function logIn(page, email) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

(async () => {
  sql("truncate auth.users cascade; delete from public.invites; update public.app_settings set value='invite'");
  const browser = await chromium.launch();
  const ctx = () => browser.newContext({ viewport: { width: 375, height: 800 } });
  const owner = addr("owner"), alice = addr("alice"), mallory = addr("mallory");

  // --- signed-out visitor
  let c = await ctx(), p = await c.newPage();
  await p.goto(`${APP}/dashboard`);
  check("signed-out visitor is sent from /dashboard to /login", p.url().includes("/login?next=%2Fdashboard"), p.url());
  let r = await p.request.get(`${APP}/api/admin/anything`);
  check("signed-out call to an admin API gets 401", r.status() === 401, r.status());
  await p.goto(`${APP}/signup`);
  check("sign-up page without a token asks for an invite", (await p.textContent("h1")).includes("need an invite"));

  // --- uninvited email
  await signUp(p, `${APP}/signup?token=made-up-token&email=${mallory}`);
  check("uninvited email cannot register (through the app)", (await formError(p)).includes("invite is not valid"), await formError(p));
  const direct = createClient(SUPA, ANON, { auth: { persistSession: false } });
  let d = await direct.auth.signUp({ email: mallory, password: PW });
  check("uninvited email cannot register (calling Supabase directly, skipping the app)", !!d.error && !d.data.user, JSON.stringify(d.error));
  d = await direct.auth.signInWithOtp({ email: mallory });
  check("uninvited email cannot register by magic link either", !!d.error, JSON.stringify(d.error));

  // --- invite bound to its email
  const ownerLink = invite(owner);
  await signUp(p, ownerLink, { email: mallory });
  check("an invite for one email cannot be used by another", (await formError(p)).includes("invite is not valid"), await formError(p));
  d = await direct.auth.signUp({ email: owner, password: PW });
  check("invited email without the token is refused", !!d.error, JSON.stringify(d.error));
  check("no account was created by the refused attempts", sql("select count(*) from auth.users") === "0");

  // --- invited sign-up, blocked until verified
  await signUp(p, ownerLink, { name: "Olivia Owner" });
  check("invited email can register and is told to check email", p.url().includes("/verify-email"), p.url());
  await logIn(p, owner);
  check("login before verifying is sent to verify-email", p.url().includes("/verify-email"), p.url());
  await p.goto(`${APP}/dashboard`);
  check("unverified account cannot open the dashboard", p.url().includes("/login"), p.url());
  check("invite is marked used", sql(`select count(*) from public.invites where email='${owner}' and used_at is not null`) === "1");

  // --- verify, first account = admin
  await p.goto(await verifyLink(owner));
  await p.waitForLoadState("networkidle");
  check("verification link signs the user in to the dashboard", p.url().endsWith("/dashboard"), p.url());
  check("dashboard greets the user by name", (await p.textContent("h1")).includes("Olivia"));
  check("no sideways scroll at 375 px", (await p.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await p.click("text=Menu");
  check("first account sees the Admin link", (await p.locator('#mobile-menu a[href="/admin"]').count()) === 1);
  r = await p.goto(`${APP}/admin`);
  check("first account (admin) can open /admin", r.status() === 200, r.status());

  // --- used invite cannot be reused
  const c2 = await ctx(), p2 = await c2.newPage();
  await signUp(p2, ownerLink);
  check("a used invite link does not create a second account", sql("select count(*) from auth.users") === "1");

  // --- normal user
  const aliceLink = invite(alice);
  await signUp(p2, aliceLink, { name: "Alice Tester" });
  await p2.goto(await verifyLink(alice));
  await p2.waitForLoadState("networkidle");
  check("second user reaches the dashboard after verifying", p2.url().endsWith("/dashboard"), p2.url());
  await p2.click("text=Menu");
  check("normal user does not see the Admin link", (await p2.locator('#mobile-menu a[href="/admin"]').count()) === 0);
  await p2.keyboard.press("Escape");
  r = await p2.goto(`${APP}/admin`);
  check("normal user gets 403 on /admin", r.status() === 403, r.status());
  check("403 page explains itself", (await p2.textContent("h1")).includes("do not have access"));
  r = await p2.request.get(`${APP}/api/admin/anything`);
  check("normal user gets 403 on admin APIs", r.status() === 403, r.status());
  check("second account is not admin", sql(`select is_admin from public.profiles_user p join auth.users u on u.id=p.id where u.email='${alice}'`) === "f");

  // --- sign out and log back in
  await p2.goto(`${APP}/dashboard`);
  await p2.click("text=Menu");
  await p2.click("#mobile-menu >> text=Sign out");
  await p2.waitForLoadState("networkidle");
  check("sign out lands on the login page", p2.url().includes("/login"), p2.url());
  await p2.goto(`${APP}/dashboard`);
  check("after sign out the dashboard is closed again", p2.url().includes("/login"), p2.url());
  await p2.goto(`${APP}/login?next=https://evil.example`);
  await p2.fill('input[name="email"]', alice);
  await p2.fill('input[name="password"]', "wrong-password-123");
  await p2.click('button[type="submit"]');
  await p2.waitForSelector('form [role="alert"]');
  check("wrong password shows a neutral error", (await formError(p2)).includes("not right"), await formError(p2));
  check("the email stays filled in after an error", (await p2.inputValue('input[name="email"]')) === alice);
  await p2.fill('input[name="password"]', PW);
  await p2.click('button[type="submit"]');
  await p2.waitForURL("**/dashboard");
  check("login works and ignores an off-site ?next= link", p2.url() === `${APP}/dashboard`, p2.url());

  // --- suspension
  sql(`update public.profiles_user set is_active=false where id=(select id from auth.users where email='${alice}')`);
  await p2.goto(`${APP}/dashboard`);
  check("a suspended user is signed out on the next page load", p2.url().includes("error=suspended"), p2.url());

  await browser.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL AUTH CHECKS PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
