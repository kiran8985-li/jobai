// End-to-end check of Prompt 3 against a LOCAL Supabase and `npm run dev` (no AI key needed).
// Run: node --env-file=.env.local tests/e2e/profiles-flow.cjs   (never against a real project)
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
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + String(extra).slice(0, 300)}`);
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
async function asUser(email) {
  const c = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: PW });
  return c;
}
const main = (p) => p.textContent("main");
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const prof = (id) => JSON.parse(sql(`select row_to_json(t) from (select * from search_profiles where id='${id}') t`));
async function fillSearch(p, v) {
  for (const [k, val] of Object.entries(v)) await p.fill(`main input[name="${k}"]`, val);
}

(async () => {
  await admin.storage.emptyBucket("cvs");
  sql("truncate auth.users cascade; delete from public.invites; update public.app_settings set value='invite'");
  const run = String(Date.now()).slice(-6);
  const owner = `owner${run}@example.com`, alice = `alice${run}@example.com`;
  await makeUser(owner, "Olivia Owner");
  const aliceId = await makeUser(alice, "Alice Tester");
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await logIn(p, alice);

  // --- onboarding carries on from CV approval to preferences
  await p.goto(`${APP}/onboarding`);
  await p.check('input[name="consent"]');
  await p.click('main button[type="submit"]');
  await p.setInputFiles('input[type="file"]', "reference/sample_cv.txt");
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/review");
  await p.getByRole("button", { name: "Approve as my master CV" }).click();
  await p.waitForURL("**/onboarding/preferences");
  check("after approving the first CV, onboarding moves to preferences", (await main(p)).includes("4. Preferences"));
  check("defaults are 75 match and 10 a day", (await p.inputValue('input[name="min_match"]')) === "75" && (await p.inputValue('input[name="daily_limit"]')) === "10");

  // --- validation keeps what was typed
  await fillSearch(p, { name: "Python in Manchester", roles: "Python Developer, Backend Engineer", locations: "Manchester, Remote", min_salary: "45,000", exclude_keywords: "PHP, unpaid", min_match: "150" });
  await p.check('input[value="permanent"]');
  await p.click('main button[type="submit"]');
  await p.waitForSelector('main form [role="alert"]');
  check("invalid minimum match is refused with a clear message", /between 0 and 100/.test(await p.textContent('main form [role="alert"]')));
  check("the form keeps what was typed", (await p.inputValue('input[name="roles"]')) === "Python Developer, Backend Engineer" && (await p.isChecked('input[value="permanent"]')));
  check("nothing saved for the invalid form", sql("select count(*) from search_profiles") === "0");
  await p.fill('input[name="min_match"]', "80");
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/auto-apply?welcome=1");
  const id1 = sql(`select id from search_profiles where user_id='${aliceId}'`);
  let r = prof(id1);
  check("search profile is saved correctly",
    r.name === "Python in Manchester" && r.roles.join("|") === "Python Developer|Backend Engineer" && r.locations.join("|") === "Manchester|Remote" &&
    r.min_salary === 45000 && r.employment_types.join() === "permanent" && r.exclude_keywords.join("|") === "PHP|unpaid" && r.min_match === 80 && r.daily_limit === 10, JSON.stringify(r));
  check("a new search has auto-apply off and no consent", r.auto_apply === false && r.consent_at === null && r.is_active === true);
  check("auto-apply page: no sideways scroll at 375 px", await noScroll(p));

  // --- auto-apply cannot be on without consent
  check("test-mode banner is shown", /Test mode is on/.test(await main(p)));
  check("sensitive-question warning is shown", /Sensitive questions are always skipped/.test(await main(p)));
  check("no 'turn on' button before consent", (await p.getByRole("button", { name: "Turn auto-apply on" }).count()) === 0);
  const asAlice = await asUser(alice);
  await asAlice.from("search_profiles").update({ auto_apply: true }).eq("id", id1);
  check("database keeps auto-apply off without consent (skipping the app)", prof(id1).auto_apply === false);
  await p.check('main input[name="consent"]');
  await p.getByRole("button", { name: "Give consent for this search" }).click();
  await p.waitForURL("**msg=consent_given");
  r = prof(id1);
  check("consent is stored with a timestamp, auto-apply still off", r.consent_at !== null && r.auto_apply === false, JSON.stringify(r));
  check("page explains what will be sent", /tailored CV/.test(await main(p)) && /Consent given on/.test(await main(p)));
  await p.getByRole("button", { name: "Turn auto-apply on" }).click();
  await p.waitForURL("**msg=auto_on");
  check("auto-apply turns on after consent", prof(id1).auto_apply === true && (await p.locator('[data-profile="Python in Manchester"]').textContent()).includes("Auto-apply on"));

  // --- pause everything
  await p.getByRole("button", { name: "Pause all auto-apply" }).click();
  await p.waitForURL("**msg=paused");
  const shownPaused = await p.getByText("On, but paused").waitFor({ timeout: 5000 }).then(() => true, () => false);
  check("pause-all is stored", sql(`select auto_apply_paused from profiles_user where id='${aliceId}'`) === "t");
  check("pause-all keeps the search's own settings", prof(id1).auto_apply === true);
  check("pause-all is shown on the page", shownPaused, await main(p));
  await p.getByRole("button", { name: "Resume auto-apply" }).click();
  await p.waitForURL("**msg=resumed");
  check("resume works", sql(`select auto_apply_paused from profiles_user where id='${aliceId}'`) === "f");

  // --- second, independent search
  await p.goto(`${APP}/profiles/new`);
  await fillSearch(p, { name: "Data roles", roles: "Data Analyst", daily_limit: "3" });
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/profiles?saved=1");
  const id2 = sql(`select id from search_profiles where user_id='${aliceId}' and name='Data roles'`);
  check("a second search is independent (own limits, no consent, auto-apply off)", prof(id2).daily_limit === 3 && prof(id2).consent_at === null && prof(id2).auto_apply === false && prof(id1).auto_apply === true);
  check("searches page lists both, no sideways scroll", (await p.locator("main li").count()) === 2 && (await noScroll(p)));

  // --- withdraw consent
  await p.goto(`${APP}/auto-apply`);
  await p.locator('[data-profile="Python in Manchester"]').getByRole("button", { name: "Withdraw consent" }).click();
  await p.waitForURL("**msg=consent_withdrawn");
  r = prof(id1);
  check("withdrawing consent turns auto-apply off immediately", r.consent_at === null && r.auto_apply === false, JSON.stringify(r));
  check("consent is asked for again", (await p.getByRole("button", { name: "Give consent for this search" }).count()) === 2);

  // --- edit, pause, delete
  await p.goto(`${APP}/profiles/${id2}`);
  check("edit form shows saved values", (await p.inputValue('input[name="roles"]')) === "Data Analyst");
  await fillSearch(p, { roles: "Data Analyst, BI Developer", min_match: "60" });
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/profiles?saved=1");
  check("edits are saved", prof(id2).roles.join("|") === "Data Analyst|BI Developer" && prof(id2).min_match === 60);
  await p.locator("main li", { hasText: "Data roles" }).getByRole("button", { name: "Pause this search" }).click();
  await p.locator("main li", { hasText: "Data roles" }).getByRole("button", { name: "Resume this search" }).waitFor();
  check("a single search can be paused", prof(id2).is_active === false);
  await p.locator("main li", { hasText: "Data roles" }).getByRole("button", { name: "Delete" }).click();
  await p.waitForFunction(() => document.querySelectorAll("main li").length === 1);
  check("a search can be deleted", sql(`select count(*) from search_profiles where user_id='${aliceId}'`) === "1");

  // --- screening answers
  await p.goto(`${APP}/auto-apply`);
  await p.selectOption('select[name="right_to_work_uk"]', "yes");
  await p.fill('input[name="notice_period"]', "1 month");
  await p.getByRole("button", { name: "Add an answer" }).click();
  await p.getByLabel("Question 1").fill("Do you have a driving licence?");
  await p.getByLabel("Answer 1").fill("Yes, full UK licence");
  await p.getByRole("button", { name: "Save screening answers" }).click();
  await p.waitForSelector('main form [role="status"]');
  const ans = () => sql(`select string_agg(key||'='||answer, ';' order by key) from screening_answers where user_id='${aliceId}'`);
  check("screening answers are saved", ans() === "custom:Do you have a driving licence?=Yes, full UK licence;notice_period=1 month;right_to_work_uk=yes", ans());
  await p.getByRole("button", { name: "Add an answer" }).click();
  await p.getByLabel("Question 2").fill("Do you have a disability?");
  await p.getByLabel("Answer 2").fill("No");
  await p.getByRole("button", { name: "Save screening answers" }).click();
  await p.waitForSelector('main form [role="alert"]');
  check("an answer to a sensitive question is refused and not stored", /sensitive topics/.test(await p.textContent('main form [role="alert"]')) && !/disab/i.test(ans()));
  await p.getByRole("button", { name: "Remove question 2" }).click();
  await p.fill('input[name="notice_period"]', "");
  await p.getByRole("button", { name: "Save screening answers" }).click();
  await p.waitForSelector('main form [role="status"]');
  check("clearing an answer removes it", ans() === "custom:Do you have a driving licence?=Yes, full UK licence;right_to_work_uk=yes", ans());
  await p.reload();
  check("saved answers are shown after reload", (await p.inputValue('select[name="right_to_work_uk"]')) === "yes" && (await p.getByLabel("Answer 1").inputValue()) === "Yes, full UK licence");

  // --- other user: isolation, and no auto-apply without a master CV
  const p2 = await (await browser.newContext()).newPage();
  await logIn(p2, owner);
  check("dashboard shows the CV step for a user with no CV", (await main(p2)).includes("Upload your CV"));
  const res = await p2.goto(`${APP}/profiles/${id1}`);
  check("another user gets 404 for this search", res.status() === 404, res.status());
  const asOwner = await asUser(owner);
  const leak = await asOwner.from("screening_answers").select("key");
  const leak2 = await asOwner.from("search_profiles").select("id");
  check("another user cannot read these searches or screening answers", leak.data.length === 0 && leak2.data.length === 0);
  await p2.goto(`${APP}/profiles/new`);
  await fillSearch(p2, { name: "Owner search", roles: "CTO" });
  await p2.click('main button[type="submit"]');
  await p2.waitForURL("**/profiles?saved=1");
  await p2.goto(`${APP}/auto-apply`);
  await p2.check('main input[name="consent"]');
  await p2.getByRole("button", { name: "Give consent for this search" }).click();
  await p2.waitForURL("**msg=consent_given");
  await p2.getByRole("button", { name: "Turn auto-apply on" }).click();
  await p2.waitForURL("**msg=need_cv");
  const shownNeedCv = await p2.getByText("Approve a master CV before turning on auto-apply.").waitFor({ timeout: 5000 }).then(() => true, () => false);
  check("auto-apply stays off without an approved master CV", sql("select auto_apply from search_profiles where name='Owner search'") === "f");
  check("the user is told a master CV is needed", shownNeedCv, await main(p2));

  await p.goto(`${APP}/dashboard`);
  check("dashboard shows the user is set up", (await main(p)).includes("You are set up"));

  await browser.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL SEARCH PROFILE CHECKS PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
