// End-to-end check of Prompt 7 against a LOCAL Supabase and `npm run dev` (no AI key needed).
// Needs DEMO_SOURCE=true, APPLY_MODE=dry_run and CRON_SECRET in .env.local.
// Run: node --env-file=.env.local tests/e2e/apply-flow.cjs   (never against a real project)
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
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const cron = () => fetch(`${APP}/api/cron/scan`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
const jobId = (title) => sql(`select id from jobs where title='${title}'`);
const apps = () => sql("select string_agg(j.title || ':' || a.status, ', ' order by j.title) from applications a join jobs j on j.id=a.job_id");
const applyText = (p) => p.locator("#apply").textContent();

(async () => {
  await admin.storage.emptyBucket("cvs");
  await admin.storage.emptyBucket("tailored");
  sql("truncate auth.users cascade; delete from public.invites; truncate public.jobs cascade; truncate public.scan_runs; truncate public.source_status; delete from public.ai_usage; update public.app_settings set value='invite'");
  const run = String(Date.now()).slice(-6);
  const owner = `owner${run}@example.com`, alice = `alice${run}@example.com`;
  await makeUser(owner, "Olivia Owner");
  const aliceId = await makeUser(alice, "Alice Tester");
  await cron();

  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await logIn(p, alice);
  await p.goto(`${APP}/applications`);
  check("Applications page starts empty with a next step", (await main(p)).includes("No applications yet"));

  // --- set up: CV, a search with a limit of 2 a day, screening answers, consent, auto-apply on
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
  await p.fill('main input[name="daily_limit"]', "2");
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
  check("nothing is applied for just by turning auto-apply on", sql("select count(*) from applications") === "0");
  const scores = sql(`select string_agg(j.title || '=' || m.score, ', ' order by m.score desc, j.title) from matches m join jobs j on j.id=m.job_id where m.filtered_reason is null and m.score >= 70`);

  // --- the scan applies (dry run)
  let scan = await cron();
  const state = apps();
  check("dry-run scan prepares sensible applications",
    state === "DevOps Engineer:manual, Python Developer:skipped, Python Developer (Contract):dry_run, Senior Backend Engineer:skipped, Software Developer:dry_run", `${state}  [matches: ${scores}]`);
  check("the scan reports how many applications it made", scan.applications === 5 && sql("select applications from scan_runs order by id desc limit 1") === "5", JSON.stringify(scan).slice(0, 200));
  check("daily limit of 2 is respected: a third email job waits, with no application", sql(`select count(*) from applications where status='dry_run'`) === "2" && sql(`select count(*) from applications where job_id='${jobId("QA Test Engineer")}'`) === "0");
  check("every application records which search it was for", sql("select count(*) from applications where search_profile_id is null") === "0");
  const notes = sql("select string_agg(kind, ',' order by kind) from notifications");
  check("one notification per application", notes === "application_dry_run,application_dry_run,application_manual,application_skipped,application_skipped", notes);
  check("the sensitive question is named in the notification", /Not applied for Senior Backend Engineer at Calder Payments\. This job asks a sensitive question \(Disability status\)/.test(sql("select string_agg(message, ' | ') from notifications where kind='application_skipped'")));

  scan = await cron();
  check("running the scan again creates no duplicate applications or notifications", apps() === state && scan.applications === 0 && sql("select count(*) from notifications") === "5", apps());

  // --- what the user sees
  await p.goto(`${APP}/jobs/${jobId("Software Developer")}`);
  let t = await applyText(p);
  check("prepared application shows 'Prepared (test mode)' and says nothing was sent", t.includes("Prepared (test mode)") && /nothing was sent/i.test(t), t.slice(0, 200));
  check("the full email is shown: recipient, subject, cover note, attachment and saved answers",
    t.includes("recruit@wrenfield.example.com") && t.includes("Application for Software Developer - Priya Shah") && t.includes("Dear Hiring Team") && t.includes("Priya-Shah-CV-Wrenfield-Health.pdf") && t.includes("Notice period: 1 month") && t.includes("Right to work in the UK: Yes"), t.slice(0, 400));
  check("job page with application: no sideways scroll at 375 px", await noScroll(p));

  await p.goto(`${APP}/jobs/${jobId("Senior Backend Engineer")}`);
  t = await applyText(p);
  check("sensitive-question job shows Skipped and why", t.includes("Skipped") && t.includes("sensitive question (Disability status)") && t.includes("never answers these"), t.slice(0, 300));

  await p.goto(`${APP}/jobs/${jobId("Python Developer")}`);
  t = await applyText(p);
  check("unanswered-question job shows Skipped and what to add", t.includes("Skipped") && t.includes("have not answered yet (Salary expectation)") && (await p.getByRole("link", { name: "Add the answer" }).count()) === 1, t.slice(0, 300));

  // --- answer the question, try again
  await p.goto(`${APP}/auto-apply`);
  await p.fill('input[name="salary_expectation"]', "£50,000 to £55,000");
  await p.getByRole("button", { name: "Save screening answers" }).click();
  await p.waitForSelector('main form [role="status"]');
  await p.goto(`${APP}/jobs/${jobId("Python Developer")}`);
  await p.getByRole("button", { name: "Try again" }).click();
  await p.waitForURL("**apply=retry**");
  check("'Try again' clears the skipped application", sql(`select count(*) from applications where job_id='${jobId("Python Developer")}'`) === "0");
  await cron();
  check("still within today's limit of 2, so it waits", sql(`select count(*) from applications where job_id='${jobId("Python Developer")}'`) === "0");
  sql(`update search_profiles set daily_limit=10 where user_id='${aliceId}'`);
  await cron();
  check("with room in the limit, the answered job and the waiting job are both prepared", sql(`select status from applications where job_id='${jobId("Python Developer")}'`) === "dry_run" && sql(`select status from applications where job_id='${jobId("QA Test Engineer")}'`) === "dry_run", apps());
  check("the new answer is in the prepared email", /Salary expectation: £50,000 to £55,000/.test(sql(`select detail->'email'->>'body' from applications where job_id='${jobId("Python Developer")}'`)));
  check("the sensitive-question job is still skipped, never sent", sql(`select status from applications where job_id='${jobId("Senior Backend Engineer")}'`) === "skipped");

  // --- manual apply: one click to mark applied
  await p.goto(`${APP}/jobs/${jobId("DevOps Engineer")}`);
  t = await applyText(p);
  check("a job that cannot be automated shows 'Waiting for you' with the advert link", t.includes("Waiting for you") && t.includes("takes applications on its own site") && (await p.getByRole("link", { name: "Open the advert to apply" }).count()) === 1, t.slice(0, 300));
  check("its tailored CV is ready to download on the same page", (await p.getByRole("link", { name: "Download PDF" }).count()) === 1);
  await p.getByRole("button", { name: "Mark as applied" }).click();
  await p.getByText("You marked this as applied").waitFor();
  check("'Mark as applied' turns it into Sent", sql(`select status || '|' || (sent_at is not null) || '|' || (detail->>'marked_applied_by_user') from applications where job_id='${jobId("DevOps Engineer")}'`) === "sent|true|true" && (await applyText(p)).includes("Sent"));

  // --- tracker
  await p.goto(`${APP}/applications`);
  const list = await main(p);
  check("Applications page lists every application with its status", (await p.locator("[data-application]").count()) === 6 && list.includes("Sent") && list.includes("Prepared (test mode)") && list.includes("Skipped"), list.slice(0, 300));
  check("Applications page: no sideways scroll at 375 px", await noScroll(p));

  // --- pause, and auto-apply off
  sql("insert into jobs (source, external_id, title, company, location, description, apply_email, apply_method, dedupe_key) values ('demo','extra-1','Python Developer','Extra One Ltd','Leeds','[Demo vacancy] python flask sql','jobs@extraone.example.com','email','extra1'), ('demo','extra-2','Python Developer','Extra Two Ltd','Leeds','[Demo vacancy] python flask sql','jobs@extratwo.example.com','email','extra2')");
  sql(`update profiles_user set auto_apply_paused=true where id='${aliceId}'`);
  await cron();
  check("while everything is paused, new email jobs are matched but not applied for", sql("select count(*) from matches m join jobs j on j.id=m.job_id where j.external_id like 'extra-%' and m.score>=70") === "2" && sql("select count(*) from applications a join jobs j on j.id=a.job_id where j.external_id like 'extra-%'") === "0");
  sql(`update profiles_user set auto_apply_paused=false where id='${aliceId}'; update search_profiles set consent_at=null where user_id='${aliceId}'`);
  await cron();
  check("with consent withdrawn, the same jobs are left waiting for the user instead", sql("select string_agg(a.status, ',') from applications a join jobs j on j.id=a.job_id where j.external_id like 'extra-%'") === "manual,manual");
  check("nothing was ever sent by the app in dry run", sql("select count(*) from applications where status='sent' and (detail->>'marked_applied_by_user') is null") === "0");

  // --- privacy between users
  const asOwner = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await asOwner.auth.signInWithPassword({ email: owner, password: PW });
  const a = await asOwner.from("applications").select("id");
  const n = await asOwner.from("notifications").select("id");
  const forge = await asOwner.from("applications").insert({ user_id: (await asOwner.auth.getUser()).data.user.id, job_id: jobId("Data Analyst"), status: "sent" });
  check("another user sees none of these applications or notifications, and cannot forge one", a.data.length === 0 && n.data.length === 0 && !!forge.error);

  await browser.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL AUTO-APPLY CHECKS PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
