// End-to-end check of Prompt 9 against a LOCAL Supabase and `npm run dev` (no AI key needed).
// Needs DEMO_SOURCE=true and CRON_SECRET in .env.local.
// Run: node --env-file=.env.local tests/e2e/admin-flow.cjs   (never against a real project)
const { chromium } = require("playwright");
const { execSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");

const APP = "http://localhost:3000";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/127\.0\.0\.1|localhost/.test(SUPA || "")) throw new Error("Refusing to run: not a local Supabase");
const PW = "correct-horse-battery-1";
const SHOTS = process.env.SHOTS;
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + String(extra).slice(0, 500)}`);
  if (!ok) failed++;
};
const sql = (q) => execSync(`psql "${DB}" -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const admin = createClient(SUPA, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function makeUser(email, name) {
  const { data: inv } = await admin.from("invites").insert({ email }).select("token").single();
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { invite_token: inv.token, name } });
  if (error) throw error;
  return data.user.id;
}
async function logIn(page, email) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/dashboard");
}
const main = (p) => p.textContent("main");
const cron = () => fetch(`${APP}/api/cron/scan`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
const ADMIN_PAGES = ["/admin", "/admin/users", "/admin/sources", "/admin/applications", "/admin/ai", "/admin/health"];

(async () => {
  await admin.storage.emptyBucket("cvs");
  await admin.storage.emptyBucket("tailored");
  sql("truncate auth.users cascade; delete from public.invites; truncate public.jobs cascade; truncate public.scan_runs; truncate public.source_status; delete from public.ai_usage; update public.app_settings set value='invite'");
  const run = String(Date.now()).slice(-6);
  const owner = `owner${run}@example.com`, alice = `alice${run}@example.com`;
  const ownerId = await makeUser(owner, "Olivia Owner");
  const aliceId = await makeUser(alice, "Alice Tester");
  const browser = await chromium.launch();

  // --- a normal user can reach no admin page or API
  const u = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await logIn(u, alice);
  const userIdPage = `/admin/users/${ownerId}`;
  const blocked = [];
  for (const path of [...ADMIN_PAGES, userIdPage]) {
    const r = await u.goto(APP + path);
    const body = await u.textContent("body");
    if (r.status() !== 403 || !body.includes("do not have access") || /Olivia|Overview|Job sources/.test(await main(u).catch(() => ""))) blocked.push(`${path}: ${r.status()}`);
  }
  check("a normal user gets 403 on every admin page", blocked.length === 0, blocked.join(", "));
  const api = await u.request.get(`${APP}/api/admin/summary`);
  check("a normal user gets 403 on the admin API", api.status() === 403, api.status());
  check("a signed-out visitor gets 401 on the admin API", (await (await browser.newContext()).request.get(`${APP}/api/admin/summary`)).status() === 401);
  await u.goto(`${APP}/dashboard`);
  await u.getByRole("button", { name: /Menu/ }).click();
  check("a normal user has no Admin link", (await u.locator('#mobile-menu a[href="/admin"]').count()) === 0);
  // Calling an admin server action by hand: post the real form's action id from a normal session.
  const a = await (await browser.newContext()).newPage();
  await logIn(a, owner);
  await a.goto(`${APP}/admin/sources`);
  const actionField = await a.locator('[data-source="demo"] form input[name^="$ACTION_ID_"]').first().getAttribute("name");
  // Server actions can be called from any page's address, so post it to one the middleware lets a normal user open.
  const forged = await u.request
    .post(`${APP}/dashboard`, { multipart: { [actionField]: "", name: "demo", enabled: "false" }, headers: { "Next-Action": actionField.replace("$ACTION_ID_", "") }, maxRedirects: 0, timeout: 20000 })
    .catch((e) => ({ status: () => `error ${e.message.slice(0, 60)}` }));
  check("a normal user cannot switch a source off by calling the admin action directly", sql("select coalesce((select enabled::text from source_status where name='demo'), 'none')") !== "false", `${forged.status()} ${sql("select enabled from source_status where name='demo'")}`);

  // --- overview
  await cron();
  await a.goto(`${APP}/admin`);
  const ov = await main(a);
  check("overview shows users, jobs, applications by status and the last scans", /2\s*Users/.test(ov) && /12\s*Jobs stored/.test(ov) && ov.includes("Applications by status") && (await a.locator("main table tbody tr").count()) === 1, ov.slice(0, 300));

  // --- invites
  await a.goto(`${APP}/admin/users`);
  await a.fill('input[name="email"]', `  New.Tester${run}@Example.com `);
  await a.getByRole("button", { name: "Create invite link" }).click();
  await a.waitForURL("**msg=invited**");
  const inviteEmail = `new.tester${run}@example.com`;
  const link = await a.locator(`[data-invite="${inviteEmail}"] [data-invite-link]`).textContent();
  const token = sql(`select token from invites where email='${inviteEmail}' and used_at is null`);
  check("creating an invite stores it (lower-cased) and shows a working sign-up link", link === `http://localhost:3000/signup?token=${token}&email=${encodeURIComponent(inviteEmail)}`, link);
  await a.fill('input[name="email"]', alice);
  await a.getByRole("button", { name: "Create invite link" }).click();
  await a.waitForURL("**msg=has_account**");
  await a.getByText("already has an account").waitFor();
  check("an invite is refused for an address that already has an account", (await main(a)).includes("already has an account"));
  const s = await (await browser.newContext()).newPage();
  await s.goto(link);
  check("the invite link opens the sign-up form with the email filled in", (await s.inputValue('input[name="email"]')) === inviteEmail);
  await a.goto(`${APP}/admin/users`);
  await a.locator(`[data-invite="${inviteEmail}"]`).getByRole("button", { name: "Withdraw" }).click();
  await a.waitForURL("**msg=revoked**");
  check("withdrawing an invite deletes it, so the link stops working", sql(`select count(*) from invites where email='${inviteEmail}'`) === "0");
  check("the user list shows both users", (await a.locator("[data-user]").count()) === 2);

  // --- suspend and restore
  await a.goto(`${APP}/admin/users/${aliceId}`);
  const act = await main(a);
  check("user activity shows counts but no CV contents", act.includes("AI calls today") && act.includes("0 / 200") && !act.includes("Northwind"));
  await a.getByRole("button", { name: "Suspend this account" }).click();
  await a.waitForURL("**msg=suspended**");
  check("suspending sets the account inactive", sql(`select is_active from profiles_user where id='${aliceId}'`) === "f");
  await u.goto(`${APP}/dashboard`);
  // Suspending also ends their sessions, so they are signed out entirely.
  check("the suspended user is locked out at once", /\/login/.test(u.url()) && sql(`select count(*) from auth.sessions where user_id='${aliceId}'`) === "0", u.url());
  await u.goto(`${APP}/login`);
  await u.fill('input[name="email"]', alice);
  await u.fill('input[name="password"]', PW);
  await u.click('main button[type="submit"]');
  await u.waitForSelector('main form [role="alert"]');
  check("the suspended user cannot sign back in, and is told why", u.url().includes("/login") && /has been suspended/.test(await u.textContent('main form [role="alert"]')), u.url());
  await a.getByRole("button", { name: "Restore this account" }).click();
  await a.waitForURL("**msg=restored**");
  await logIn(u, alice);
  check("after restoring, the user can sign in again", u.url().endsWith("/dashboard"));
  await a.goto(`${APP}/admin/users/${ownerId}`);
  check("an admin cannot suspend themselves", (await a.getByRole("button", { name: "Suspend this account" }).count()) === 0);

  // --- job sources: switch off, next scan skips it; switch on, run now
  await a.goto(`${APP}/admin/sources`);
  check("sources page lists all five, with 'not set up' for those without keys", (await a.locator("[data-source]").count()) === 5 && (await a.locator('[data-source="adzuna"] [data-source-state]').textContent()) === "Not set up" && (await a.locator('[data-source="demo"] [data-source-state]').textContent()) === "On");
  check("it shows the demo source's last run and count", /Jobs last run: 12/.test(await a.locator('[data-source="demo"]').textContent()));
  await a.locator('[data-source="demo"]').getByRole("button", { name: "Switch off" }).click();
  await a.waitForURL("**msg=off**");
  check("switching a source off is stored", sql("select enabled from source_status where name='demo'") === "f" && (await a.locator('[data-source="demo"] [data-source-state]').textContent()) === "Switched off");
  const before = sql("select last_run from source_status where name='demo'");
  const scan = await cron();
  check("the next scan skips the switched-off source", scan.sources.find((x) => x.name === "demo").state === "disabled" && scan.totalFetched === 0 && sql("select last_run from source_status where name='demo'") === before, JSON.stringify(scan.sources));
  check("'Run now' is not offered for a switched-off source", (await a.locator('[data-source="demo"]').getByRole("button", { name: "Run now" }).count()) === 0);
  await a.locator('[data-source="demo"]').getByRole("button", { name: "Switch on" }).click();
  await a.waitForURL("**msg=on**");
  await a.locator('[data-source="demo"]').getByRole("button", { name: "Run now" }).click();
  await a.waitForURL("**msg=ran**", { timeout: 120000 });
  await a.getByText(/Demo ran:/).waitFor();
  check("'Run now' runs just that source and reports the count", (await main(a)).includes("Demo ran: 12 jobs fetched.") && sql("select count(*) from scan_runs") === "3");

  // --- application log
  sql(`insert into search_profiles (user_id, name, roles) values ('${aliceId}', 'Py', '{Python Developer}')`);
  sql(`insert into applications (user_id, job_id, status, method, detail) select '${aliceId}', id, 'skipped', 'email', '{"skip_reason":"This job asks a sensitive question (Disability status)."}' from jobs where title='Senior Backend Engineer'`);
  sql(`insert into applications (user_id, job_id, status, method) select '${aliceId}', id, 'manual', 'ats' from jobs where title='DevOps Engineer'`);
  sql(`insert into applications (user_id, job_id, status, method) select '${ownerId}', id, 'dry_run', 'email' from jobs where title='Python Developer'`);
  await a.goto(`${APP}/admin/applications`);
  check("the application log lists every application", (await a.locator("main table tbody tr").count()) === 3);
  await a.selectOption('select[name="status"]', "skipped");
  await a.getByRole("button", { name: "Filter" }).click();
  await a.waitForURL("**status=skipped**");
  const log = await main(a);
  check("filtering by status works and shows the reason", (await a.locator("main table tbody tr").count()) === 1 && log.includes("sensitive question") && log.includes(alice));
  await a.goto(`${APP}/admin/applications?user=${ownerId}`);
  check("filtering by user works", (await a.locator("main table tbody tr").count()) === 1);

  // --- AI usage and cost
  sql(`insert into ai_usage (user_id, purpose, model, prompt_tokens, completion_tokens, ok) values ('${aliceId}','cv_tailor','gemini-3.5-flash',1000000,500000,true), ('${aliceId}','cv_parse','gemini-3.5-flash',200000,100000,true), ('${aliceId}','cv_tailor','gemini-3.5-flash',0,0,false), ('${ownerId}','match_review','gemini-3.5-flash',100000,0,true)`);
  await a.goto(`${APP}/admin/ai`);
  const ai = await main(a);
  // 1.3M in × $0.30 + 0.6M out × $1.20 = $0.39 + $0.72 = $1.11
  check("AI totals and estimated cost are right", /4\s*AI calls/.test(ai) && ai.includes("1 failed") && ai.includes("$1.11") && ai.includes("gemini-3.5-flash"), ai.slice(0, 400));
  check("usage is broken down by purpose and by user, with the daily limit visible", ai.includes("Tailoring CVs") && ai.includes("Eligibility checks") && ai.includes(alice) && ai.includes("3 / 200") && ai.includes("Daily limit: 200 calls per user"));

  // --- system health
  sql("insert into scan_runs (started_at, finished_at, error) values (now() - interval '5 minutes', now() - interval '5 minutes', 'Matching failed')");
  await a.goto(`${APP}/admin/health`);
  const h = await main(a);
  check("health shows the scheduler is on schedule", (await a.locator("[data-scheduler]").getAttribute("data-scheduler")) === "ok" && h.includes("On schedule."));
  check("health lists errors from the last 24 hours", h.includes("Matching failed") && h.includes("A cv_tailor call failed"));
  check("health flags that demo jobs are on and email sending is off", h.includes("DEMO_SOURCE is on") && h.includes("Switched off in code for now"));
  sql("update scan_runs set finished_at = now() - interval '2 hours', started_at = now() - interval '2 hours'");
  await a.reload();
  check("health warns when the scheduler is overdue", (await a.locator("[data-scheduler]").getAttribute("data-scheduler")) === "overdue");
  const sum = await a.request.get(`${APP}/api/admin/summary`);
  const body = await sum.json();
  check("the admin API answers the admin with the same summary", sum.status() === 200 && body.scanOverdue === true && body.errors24h >= 2);

  // --- every admin page at 375 px, both themes, and the Admin link for admins
  for (const scheme of ["light", "dark"]) {
    const page = await (await browser.newContext({ viewport: { width: 375, height: 800 }, colorScheme: scheme })).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 150)));
    await logIn(page, owner);
    const wide = [];
    for (const path of [...ADMIN_PAGES, `/admin/users/${aliceId}`]) {
      const r = await page.goto(APP + path);
      if (r.status() !== 200) wide.push(`${path} HTTP ${r.status()}`);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 375) wide.push(`${path} ${w}px`);
      if (SHOTS && scheme === "light") await page.screenshot({ path: `${SHOTS}/${path.replace(/\//g, "_").replace(/^_/, "").replace(/[0-9a-f-]{36}/, "detail")}.png`, fullPage: true });
    }
    check(`every admin page fits 375 px with no sideways scroll, ${scheme} theme`, wide.length === 0, wide.join("; "));
    check(`no page errors on admin pages, ${scheme} theme`, errors.length === 0, errors.join(" | "));
    await page.getByRole("button", { name: /Menu/ }).click();
    check(`the admin sees the Admin link, ${scheme} theme`, (await page.locator('#mobile-menu a[href="/admin"]').count()) === 1);
  }

  await browser.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL ADMIN CHECKS PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
