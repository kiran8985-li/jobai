// End-to-end check of Prompt 8 against a LOCAL Supabase and `npm run dev` (no AI key needed).
// Needs DEMO_SOURCE=true, APPLY_MODE=dry_run and CRON_SECRET in .env.local.
// Run: node --env-file=.env.local tests/e2e/dashboard-flow.cjs   (never against a real project)
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
// Waits for any loading screen to finish before reading the page.
const main = async (p) => {
  await p.waitForFunction(() => !document.querySelector('main [role="status"][aria-live="polite"]'), null, { timeout: 30000 });
  return p.textContent("main");
};
const cron = () => fetch(`${APP}/api/cron/scan`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
const count = (p, s) => p.locator(`[data-count="${s}"] span`).first().textContent();

(async () => {
  await admin.storage.emptyBucket("cvs");
  await admin.storage.emptyBucket("tailored");
  sql("truncate auth.users cascade; delete from public.invites; truncate public.jobs cascade; truncate public.scan_runs; truncate public.source_status; delete from public.ai_usage; update public.app_settings set value='invite'");
  const run = String(Date.now()).slice(-6);
  const newbie = `new${run}@example.com`, alice = `alice${run}@example.com`, other = `other${run}@example.com`;
  await makeUser(`owner${run}@example.com`, "Olivia Owner");
  const newbieId = await makeUser(newbie, "Nina New");
  const aliceId = await makeUser(alice, "Alice Tester");
  await makeUser(other, "Omar Other");
  const browser = await chromium.launch();

  // --- empty account shows helpful next steps
  const n = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await logIn(n, newbie);
  const empty = await main(n);
  check("an empty account's dashboard shows the next step and the 4-step path", empty.includes("Upload your CV") && empty.includes("1. Upload your CV") && empty.includes("4. Matches and prepared applications appear here"));
  for (const [path, text] of [["/jobs", "Approve your CV first"], ["/applications", "No applications yet"], ["/notifications", "No notifications yet"], ["/cvs", "No CVs yet"], ["/profiles", "No searches yet"]]) {
    await n.goto(APP + path);
    check(`empty ${path} explains what to do`, (await main(n)).includes(text));
  }
  await n.goto(`${APP}/dashboard`);
  check("'Run scan now' is not offered before the user is set up", (await n.getByRole("button", { name: "Run scan now" }).count()) === 0);

  // --- set Alice up (CV, search, answers, consent, auto-apply on) and let the scan work
  const p = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await logIn(p, alice);
  await p.goto(`${APP}/onboarding`);
  await p.check('input[name="consent"]');
  await p.click('main button[type="submit"]');
  await p.setInputFiles('input[type="file"]', "reference/sample_cv.txt");
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/review");
  await p.getByRole("button", { name: "Approve as my master CV" }).click();
  await p.waitForURL("**/onboarding/preferences");
  await p.fill('main input[name="name"]', "Python jobs");
  await p.fill('main input[name="roles"]', "Python Developer, Software Developer, Senior Backend Engineer, DevOps Engineer");
  await p.fill('main input[name="min_match"]', "70");
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/auto-apply?welcome=1");
  await p.selectOption('select[name="right_to_work_uk"]', "yes");
  await p.fill('input[name="notice_period"]', "1 month");
  await p.getByRole("button", { name: "Save screening answers" }).click();
  await p.waitForSelector('main form [role="status"]');
  await p.check('main input[name="consent"]');
  await p.getByRole("button", { name: "Give consent for this search" }).click();
  await p.waitForURL("**msg=consent_given");
  await p.getByRole("button", { name: "Turn auto-apply on" }).click();
  await p.waitForURL("**msg=auto_on");

  // --- "Run scan now": only this user's work, then a cooldown
  await p.goto(`${APP}/dashboard`);
  check("dashboard shows the last check time and test mode before any scan", (await p.locator("[data-last-scan]").textContent()) === "not yet" && (await main(p)).includes("in test mode: nothing is sent"));
  await p.getByRole("button", { name: "Run scan now" }).click();
  await p.waitForURL("**scan=done**", { timeout: 120000 });
  await p.getByText(/Scan finished:/).waitFor();
  check("'Run scan now' runs a scan and reports the results", /Scan finished: 12 new jobs, \d+ new match(es)?, 6 applications prepared or sent\./.test(await main(p)), (await main(p)).slice(0, 300));
  check("it processed only this user's work", sql("select count(distinct user_id) from applications") === "1" && sql(`select count(*) from applications where user_id <> '${aliceId}'`) === "0" && sql(`select count(*) from matches where user_id <> '${aliceId}'`) === "0");
  check("the last check time updates", (await p.locator("[data-last-scan]").textContent()) === "just now");
  await p.getByRole("button", { name: "Run scan now" }).click();
  await p.waitForURL("**scan=cooldown**");
  await p.getByText(/once every 10 minutes/).waitFor();
  check("a second click within 10 minutes is refused politely", /once every 10 minutes\. Try again in \d+ minutes?/.test(await main(p)) && sql("select count(*) from scan_runs") === "1");
  const asAlice = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await asAlice.auth.signInWithPassword({ email: alice, password: PW });
  const cheat = await asAlice.from("profiles_user").update({ last_manual_scan_at: null }).eq("id", aliceId).select("id");
  check("the user cannot reset their own cooldown", !!cheat.error || cheat.data.length === 0);

  // --- dashboard numbers
  await p.goto(`${APP}/dashboard`);
  const c = { sent: await count(p, "sent"), manual: await count(p, "manual"), dry_run: await count(p, "dry_run"), skipped: await count(p, "skipped"), failed: await count(p, "failed") };
  check("applications by status match the database", JSON.stringify(c) === JSON.stringify({ sent: "0", manual: "1", dry_run: "3", skipped: "2", failed: "0" }), JSON.stringify(c));
  const d = await main(p);
  check("'Needs your attention' lists the skipped and waiting applications", d.includes("Needs your attention") && d.includes("Senior Backend Engineer, Calder Payments") && d.includes("DevOps Engineer, Stonebridge Cloud") && (await p.locator("section[aria-labelledby='att-h'] li").count()) === 3);
  check("'New matches this week' shows matches at or above the minimum, best first", (await p.locator("section[aria-labelledby='new-h'] li").count()) === 5 && (await p.locator("section[aria-labelledby='new-h'] [aria-label^='Match score']").first().textContent()) === "100");

  // --- applications: filters, search, detail
  await p.locator('[data-count="skipped"]').click();
  await p.waitForURL("**/applications?status=skipped");
  await p.locator("[data-application]").first().waitFor();
  check("clicking a dashboard number opens the matching filter", (await p.locator("[data-application]").count()) === 2);
  await p.getByRole("link", { name: /^Waiting for you/ }).click();
  await p.waitForURL("**status=manual**");
  check("status filter works", (await p.locator("[data-application]").allTextContents()).join() .includes("DevOps Engineer") && (await p.locator("[data-application]").count()) === 1);
  await p.goto(`${APP}/applications`);
  await p.fill("#q", "wrenfield");
  await p.getByRole("button", { name: "Search" }).click();
  await p.waitForURL("**q=wrenfield**");
  check("search by company works", (await p.locator("[data-application]").count()) === 1);
  await p.locator("[data-application]").first().click();
  await p.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
  const detail = await main(p);
  check("detail view shows what happened, the email and the exact CV version", detail.includes("Prepared (test mode)") && detail.includes("Test mode: prepared, nothing was sent.") && detail.includes("The prepared email") && detail.includes("recruit@wrenfield.example.com") && detail.includes("The CV for this application") && detail.includes("Northwind Digital Ltd") && (await p.getByRole("link", { name: "Download PDF" }).count()) === 1);
  const otherApp = sql("select id from applications limit 1");
  const o = await (await browser.newContext()).newPage();
  await logIn(o, other);
  check("another user gets 404 on this application", (await o.goto(`${APP}/applications/${otherApp}`)).status() === 404);

  // --- notifications and the unread badge
  await p.goto(`${APP}/dashboard`);
  const menuBadge = await p.getByRole("button", { name: /Menu/ }).textContent();
  check("the phone menu button shows the unread count", menuBadge.includes("6"), menuBadge);
  await p.getByRole("button", { name: /Menu/ }).click();
  check("the Notifications link shows the unread badge", (await p.locator('#mobile-menu a[href="/notifications"]').textContent()).includes("6"));
  await p.locator('#mobile-menu a[href="/notifications"]').click();
  await p.waitForURL("**/notifications");
  await p.locator("[data-notification]").first().waitFor();
  check("notifications are listed, unread highlighted", (await p.locator('[data-notification="unread"]').count()) === 6 && (await main(p)).includes("Unread (6)"));
  await p.getByRole("button", { name: "Mark read" }).first().click();
  await p.waitForFunction(() => document.querySelectorAll('[data-notification="unread"]').length === 5);
  check("marking one read updates the list and the badge", (await p.getByRole("button", { name: /Menu/ }).textContent()).includes("5") && sql(`select count(*) from notifications where user_id='${aliceId}' and not is_read`) === "5");
  await p.goto(`${APP}/notifications?show=unread`);
  await p.locator("[data-notification]").first().waitFor();
  check("unread filter works", (await p.locator("[data-notification]").count()) === 5);
  await p.getByRole("button", { name: "Mark all as read" }).click();
  await p.waitForFunction(() => document.querySelectorAll("[data-notification]").length === 0);
  check("'Mark all as read' clears the badge", (await main(p)).includes("You are all caught up") && !(await p.getByRole("button", { name: /Menu/ }).textContent()).match(/\d/));
  const tamper = await asAlice.from("notifications").update({ message: "edited" }).eq("user_id", aliceId).select("id");
  check("users can only change whether a notification is read", !!tamper.error || tamper.data.length === 0);
  await p.goto(`${APP}/notifications`);
  await p.locator("[data-notification]").first().waitFor();
  await p.locator("[data-notification]").first().getByRole("link", { name: "View" }).click();
  await p.waitForURL(/\/jobs\//);
  check("a notification's link opens the job", /\/jobs\/[0-9a-f-]{36}/.test(p.url()));

  // --- every page: 375 px wide, both themes, no console errors
  const jobPage = `/jobs/${sql("select id from jobs where title='Software Developer'")}`;
  const appPage = `/applications/${sql(`select a.id from applications a join jobs j on j.id=a.job_id where j.title='Software Developer'`)}`;
  const cvId = sql(`select id from cvs where user_id='${aliceId}' and approved`);
  const pages = ["/dashboard", "/jobs", "/jobs?score=0", jobPage, "/applications", appPage, "/cvs", `/cvs/${cvId}/review`, "/profiles", "/profiles/new", "/auto-apply", "/notifications", "/account", "/onboarding"];
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 1200)));
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 150)));
    await logIn(page, alice);
    const wide = [];
    for (const path of pages) {
      const before = errors.length;
      const res = await page.goto(APP + path);
      await page.waitForTimeout(400);
      if (errors.length > before) errors[errors.length - 1] = `${path}: ${errors[errors.length - 1]}`;
      if (res.status() !== 200) wide.push(`${path} HTTP ${res.status()}`);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 375) wide.push(`${path} ${w}px`);
      const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      if (dark !== (scheme === "dark")) wide.push(`${path} wrong theme`);
      if (SHOTS && scheme === "light" && ["/dashboard", "/applications", appPage, "/notifications"].includes(path)) {
        await page.screenshot({ path: `${SHOTS}/${path.split("/")[1]}${path === appPage ? "-detail" : ""}-375.png`, fullPage: true });
      }
    }
    check(`every page fits 375 px with no sideways scroll, ${scheme} theme`, wide.length === 0, wide.join("; "));
    check(`no browser errors on any page, ${scheme} theme`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  if (SHOTS) {
    const desk = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" })).newPage();
    await logIn(desk, alice);
    await desk.screenshot({ path: `${SHOTS}/dashboard-desktop-dark.png`, fullPage: true });
  }

  await browser.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL DASHBOARD CHECKS PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
