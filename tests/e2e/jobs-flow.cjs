// End-to-end check of Prompt 5 against a LOCAL Supabase, `npm run dev` and tests/e2e/fake-ai.cjs.
// Needs DEMO_SOURCE=true, CRON_SECRET and DEEPSEEK_* pointing at the fake AI in .env.local.
// Run: node --env-file=.env.local tests/e2e/jobs-flow.cjs   (never against a real project)
const { chromium } = require("playwright");
const { execSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");

const APP = "http://localhost:3000";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/127\.0\.0\.1|localhost/.test(SUPA || "")) throw new Error("Refusing to run: not a local Supabase");
const PW = "correct-horse-battery-1";
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + String(extra).slice(0, 400)}`);
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
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const titles = (p) => p.locator("main li h2").allTextContents();
const scores = async (p) => (await p.locator('main li [aria-label^="Match score"]').allTextContents()).map(Number);
const cron = () => fetch(`${APP}/api/cron/scan`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());

(async () => {
  await admin.storage.emptyBucket("cvs");
  sql("truncate auth.users cascade; delete from public.invites; truncate public.jobs cascade; truncate public.scan_runs; truncate public.source_status; delete from public.ai_usage; update public.app_settings set value='invite'");
  await fetch("http://127.0.0.1:4010/reset");
  const run = String(Date.now()).slice(-6);
  const owner = `owner${run}@example.com`, alice = `alice${run}@example.com`;
  await makeUser(owner, "Olivia Owner");
  const aliceId = await makeUser(alice, "Alice Tester");

  // --- a scan before anyone has a search: demo jobs arrive, nothing to match
  let scan = await cron();
  check("first scan stores the 12 demo jobs and makes no matches", scan.newJobs === 12 && scan.newMatches === 0 && sql("select count(*) from matches") === "0", JSON.stringify(scan));

  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await logIn(p, alice);
  await p.goto(`${APP}/jobs`);
  check("Jobs page asks for an approved CV first", (await main(p)).includes("Approve your CV first"));

  // --- onboarding: CV, then a search; jobs are scored the moment the search is saved
  await p.goto(`${APP}/onboarding`);
  await p.check('input[name="consent"]');
  await p.click('main button[type="submit"]');
  await p.setInputFiles('input[type="file"]', "reference/sample_cv.txt");
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/review");
  await p.getByRole("button", { name: "Approve as my master CV" }).click();
  await p.waitForURL("**/onboarding/preferences");
  check("no matches exist before a search is saved", sql("select count(*) from matches") === "0");
  await p.fill('main input[name="name"]', "Python jobs");
  await p.fill('main input[name="roles"]', "Python Developer, Software Developer");
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/auto-apply?welcome=1");
  check("saving the search scores all 12 jobs straight away", sql(`select count(*) from matches where user_id='${aliceId}'`) === "12");
  check("no AI was used for the instant scores", sql("select count(*) from ai_usage where purpose='match_review'") === "0");

  // --- job list
  await p.goto(`${APP}/jobs`);
  let t = await titles(p);
  check("default view shows only matches at or above the minimum (the three developer jobs)", t.length === 3 && t.every((x) => /Python Developer|Software Developer/.test(x)), t.join(" | "));
  check("their scores are 100", (await scores(p)).every((s) => s === 100), (await scores(p)).join());
  check("jobs list: no sideways scroll at 375 px", await noScroll(p));
  await p.selectOption('select[name="score"]', "0");
  await p.click('main form button[type="submit"]');
  await p.waitForURL("**score=0**");
  t = await titles(p);
  const s = await scores(p);
  check("'every scored job' lists all 12, best first", t.length === 12 && s.every((x, i) => i === 0 || s[i - 1] >= x), s.join());
  check("Python developer jobs are at the top and the accountant job is at the bottom score", /Python Developer|Software Developer/.test(t[0]) && s[t.indexOf("Accounts Assistant")] === Math.min(...s), t.join(" | "));
  check("each card explains itself in one line", /of \d+ skills in the advert are on your CV/.test(await p.locator("main li").first().textContent()));
  await p.fill('input[name="location"]', "leeds");
  await p.click('main form button[type="submit"]');
  await p.waitForURL("**location=leeds**");
  check("location filter works", (await titles(p)).join() === "Data Analyst", (await titles(p)).join());
  await p.fill('input[name="location"]', "");
  await p.selectOption('select[name="sort"]', "date");
  await p.click('main form button[type="submit"]');
  await p.waitForURL("**sort=date**");
  check("sort by newest works", (await titles(p))[0] === "Python Developer" && (await titles(p))[11] === "QA Test Engineer", (await titles(p)).join(" | "));
  check("source filter lists the demo source", (await p.locator('select[name="source"] option').allTextContents()).join() === "All sources,Demo");
  await p.selectOption('select[name="score"]', "90");
  await p.fill('input[name="location"]', "nowhere");
  await p.click('main form button[type="submit"]');
  await p.waitForURL("**location=nowhere**");
  check("empty filter result is explained", (await main(p)).includes("No jobs fit these filters"));

  // --- job detail explains the score
  const seniorId = sql("select id from jobs where title='Senior Backend Engineer'");
  await p.goto(`${APP}/jobs/${seniorId}`);
  const d = await main(p);
  const expected = sql(`select score from matches where job_id='${seniorId}'`);
  check("detail page shows the score and its four parts", d.includes("Why this score") && (await p.locator('main [role="img"]').count()) === 4 && d.includes(`${expected} is below your minimum match of 75`), d.slice(0, 300));
  check("detail page lists skills you have and skills you lack", /Skills you have \(3\)/.test(d) && /django/.test(d) && /kubernetes/.test(d));
  check("detail page shows the description and a link to the advert", d.includes("[Demo vacancy]") && (await p.getByRole("link", { name: "View the original advert" }).getAttribute("rel")).includes("noopener"));
  check("job detail: no sideways scroll at 375 px", await noScroll(p));
  const parts = JSON.parse(sql(`select breakdown from matches where job_id='${seniorId}'`));
  check("the four parts add up to the score", parts.role.points + parts.skills.points + parts.location.points + parts.salary.points === Number(expected));

  // --- scheduled scan adds the AI eligibility check
  scan = await cron();
  const reviewed = Number(sql("select count(*) from matches where ai_reviewed"));
  check("scheduled scan runs the AI eligibility check on jobs near the threshold only", reviewed >= 3 && reviewed <= 20 && sql("select min(score) >= 0 from matches where ai_reviewed") === "t" && sql("select count(*) from ai_usage where purpose='match_review' and ok") === String(reviewed), `reviewed ${reviewed}`);
  const softId = sql("select id from jobs where title='Software Developer'");
  check("a 'not eligible' verdict drops the job just below the minimum match", sql(`select score from matches where job_id='${softId}'`) === "74");
  await p.goto(`${APP}/jobs/${softId}`);
  check("the AI's reason is shown on the job", /AI eligibility check: may not be eligible/.test(await main(p)) && /security clearance/.test(await main(p)));
  await p.goto(`${APP}/jobs`);
  check("that job is no longer among the matches", (await titles(p)).length === 2 && !(await titles(p)).includes("Software Developer"), (await titles(p)).join(" | "));
  const sent = (await (await fetch("http://127.0.0.1:4010/requests")).json()).filter((r) => r.body.includes("JOB ADVERT")).map((r) => r.body).join("\n");
  check("eligibility requests carry no name, contact details or employers", sent.includes("Senior Software Developer") && !/priya|shah|example\.com\b.*@|07700|Northwind|Brightside/i.test(sent));
  scan = await cron();
  check("a later scan does not pay to review the same jobs again", sql("select count(*) from ai_usage where purpose='match_review'") === String(reviewed) && scan.newMatches === 0, JSON.stringify(scan).slice(0, 200));

  // --- changing the search rescored everything; filtered jobs say why
  const pid = sql(`select id from search_profiles where user_id='${aliceId}'`);
  await p.goto(`${APP}/profiles/${pid}`);
  await p.fill('main input[name="exclude_keywords"]', "contract");
  await p.fill('main input[name="locations"]', "Manchester");
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/profiles?saved=1");
  check("editing the search rescored every job", sql(`select count(*) from matches where user_id='${aliceId}'`) === "12" && sql("select count(*) from matches where ai_reviewed") === "0");
  const contractId = sql("select id from jobs where title='Python Developer (Contract)'");
  await p.goto(`${APP}/jobs/${contractId}`);
  check("an excluded job says why it was left out", /Left out of your matches/.test(await main(p)) && /Mentions “contract”, which you excluded/.test(await main(p)), (await main(p)).slice(0, 300));
  const leedsId = sql("select id from jobs where title='Data Analyst'");
  check("a job outside the chosen locations is filtered", sql(`select filtered_reason from matches where job_id='${leedsId}'`) === "Not in your locations (Leeds)");
  await p.goto(`${APP}/jobs?score=0`);
  t = await titles(p);
  check("filtered jobs do not appear in the list", !t.includes("Python Developer (Contract)") && !t.includes("Data Analyst") && t.includes("Python Developer"), t.join(" | "));

  // --- privacy between users
  const asOwner = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await asOwner.auth.signInWithPassword({ email: owner, password: PW });
  const leak = await asOwner.from("matches").select("id");
  const forge = await asOwner.from("matches").update({ score: 100 }).eq("user_id", aliceId).select("id");
  check("another user cannot read or change these matches", leak.data.length === 0 && (!!forge.error || forge.data.length === 0));
  check("a user with no CV has no matches", sql(`select count(*) from matches where user_id <> '${aliceId}'`) === "0");

  await browser.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL JOB MATCHING CHECKS PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
