// End-to-end check of Prompt 2 against a LOCAL Supabase and `npm run dev`.
// MODE=ai   : DEEPSEEK_* point at tests/e2e/fake-ai.cjs
// MODE=noai : DEEPSEEK_API_KEY removed (fallback reader)
// Run: MODE=ai node --env-file=.env.local tests/e2e/cv-flow.cjs   (never against a real project)
const { chromium } = require("playwright");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");

const APP = "http://localhost:3000";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/127\.0\.0\.1|localhost/.test(SUPA || "")) throw new Error("Refusing to run: not a local Supabase");
const MODE = process.env.MODE || "noai";
const FIX = process.env.FIXTURES;
const PW = "correct-horse-battery-1";
const expected = JSON.parse(fs.readFileSync("tests/fixtures/sample_cv.expected.json", "utf8"));
// Compare JSON regardless of key order (Postgres jsonb reorders keys).
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + String(extra).slice(0, 300)}`);
  if (!ok) failed++;
};
const sql = (q) => execSync(`psql "${DB}" -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const admin = createClient(SUPA, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function makeUser(email, name) {
  const { data: inv } = await admin.from("invites").insert({ email }).select("token").single();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true, user_metadata: { invite_token: inv.token, name },
  });
  if (error) throw error;
  return data.user.id;
}
async function logIn(page, email) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}
async function upload(page, file) {
  await page.goto(`${APP}/onboarding`);
  await page.setInputFiles('input[type="file"]', file);
  await page.click('main button[type="submit"]');
  await Promise.race([page.waitForURL("**/review"), page.waitForSelector('main form [role="alert"]')]);
}
const formError = async (page) => ((await page.locator('main form [role="alert"]').count()) ? page.textContent('main form [role="alert"]') : "");

(async () => {
  await admin.storage.emptyBucket("cvs");
  if (MODE === "ai") await fetch("http://127.0.0.1:4010/reset");
  sql("truncate auth.users cascade; delete from public.invites; update public.app_settings set value='invite'");
  const run = String(Date.now()).slice(-6);
  const owner = `owner${run}@example.com`, alice = `alice${run}@example.com`;
  await makeUser(owner, "Olivia Owner");
  const aliceId = await makeUser(alice, "Alice Tester");
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await logIn(p, alice);

  // --- consent gate
  check("dashboard points a new user to CV upload", (await p.textContent("main")).includes("Upload your CV"));
  await p.goto(`${APP}/onboarding`);
  check("consent step is shown first, naming DeepSeek and China", /DeepSeek/.test(await p.textContent("main")) && /China/.test(await p.textContent("main")));
  check("no upload field before consent", (await p.locator('input[type="file"]').count()) === 0);
  const asAlice = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await asAlice.auth.signInWithPassword({ email: alice, password: PW });
  let r = await asAlice.from("cvs").insert({ user_id: aliceId, filename: "sneaky.pdf" });
  check("database refuses a CV before consent (skipping the app)", !!r.error, JSON.stringify(r));
  r = await asAlice.storage.from("cvs").upload(`${aliceId}/sneaky.txt`, "hello", { contentType: "text/plain" });
  check("file storage refuses an upload before consent", !!r.error, JSON.stringify(r));
  await p.check('input[name="consent"]');
  await p.click('main button[type="submit"]');
  await p.waitForSelector('input[type="file"]');
  check("consent is stored with a timestamp", sql(`select ai_consent_at is not null from profiles_user where id='${aliceId}'`) === "t");

  // --- bad files
  await upload(p, `${FIX}/scan.pdf`);
  check("scanned PDF gets a clear message", /no readable text/i.test(await formError(p)), await formError(p));
  await upload(p, `${FIX}/fake.pdf`);
  check("a non-PDF renamed to .pdf is refused", /not a PDF/i.test(await formError(p)), await formError(p));
  await upload(p, `${FIX}/notes.exe`);
  check("unsupported file type is refused", /Unsupported file type/i.test(await formError(p)), await formError(p));
  await p.goto(`${APP}/onboarding`);
  await p.setInputFiles('input[type="file"]', `${FIX}/big.txt`);
  check("a file over 5 MB is refused before sending", /larger than 5 MB/.test(await p.textContent("main")));
  check("nothing was stored for the refused files", sql("select count(*) from cvs") === "0" && sql("select count(*) from storage.objects") === "0");

  // --- upload the sample CV as PDF
  await upload(p, `${FIX}/sample.pdf`);
  check("PDF upload lands on the review page", p.url().endsWith("/review"), (await formError(p)) || p.url());
  const cvId = p.url().split("/").slice(-2)[0];
  const row = JSON.parse(sql(`select row_to_json(t) from (select parsed_by, approved, flags, profile_json, storage_path from cvs where id='${cvId}') t`));
  check("original file is stored in the user's private folder", row.storage_path.startsWith(aliceId + "/") && sql(`select count(*) from storage.objects where name='${row.storage_path}'`) === "1");
  check("new CV is not approved", row.approved === false);
  check("contact details are filled in", row.profile_json.name === "Priya Shah" && row.profile_json.email === "priya.shah@example.com" && row.profile_json.phone === "07700 900123");

  if (MODE === "ai") {
    check("read by AI", row.parsed_by === "ai", row.parsed_by);
    const sent = await (await fetch("http://127.0.0.1:4010/requests")).json();
    const wire = sent.map((s) => s.body).join("\n");
    check("exactly one AI request was made, with the configured model", sent.length === 1 && JSON.parse(sent[0].body).model === "fake-model", sent.length);
    check("the AI request contains the CV body", wire.includes("Northwind Digital Ltd"));
    check("the AI request contains no email, phone, name or location",
      !/priya|shah|example\.com|07700|900123|Manchester/i.test(wire), wire.match(/priya|shah|example\.com|07700|900123|Manchester/i));
    check("invented employer and skill were removed and flagged", !JSON.stringify(row.profile_json).match(/Google|Kubernetes|CTO/) && row.flags.length === 2, row.flags);
    check("flags are shown to the user", /Google/.test(await p.textContent("main")) && /could not find in your file/.test(await p.textContent("main")));
    check("AI call is logged for cost tracking", sql(`select purpose||'|'||model||'|'||prompt_tokens||'|'||completion_tokens||'|'||ok from ai_usage where user_id='${aliceId}'`) === "cv_parse|fake-model|321|123|true");
    const want = { ...expected, skills: expected.skills.slice(0, 8) };
    check("AI result has the reference structure", canon(row.profile_json) === canon(want), JSON.stringify(row.profile_json));
  } else {
    check("read by the fallback reader with no key", row.parsed_by === "heuristic", row.parsed_by);
    check("fallback result matches the Python reference exactly", canon(row.profile_json) === canon(expected), JSON.stringify(row.profile_json));
    check("no AI usage logged", sql("select count(*) from ai_usage") === "0");
  }

  // --- review, edit, save, approve
  check("review form shows the parsed data", (await p.inputValue('input[autocomplete="name"]')) === "Priya Shah");
  check("no sideways scroll on the review page at 375 px", (await p.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await p.goto(`${APP}/dashboard`);
  check("dashboard asks to review and approve", (await p.textContent("main")).includes("Review and approve your CV"));
  await p.goto(`${APP}/cvs/${cvId}/review`);
  await p.getByLabel("Headline").fill("Senior Backend Developer");
  await p.getByRole("button", { name: "Remove Skill 1", exact: true }).click();
  await p.getByRole("button", { name: "Add a bullet" }).first().click();
  await p.getByLabel("Bullet 4").fill("Led the migration to Python 3.12");
  await p.getByRole("button", { name: "Save and finish later" }).click();
  await p.waitForSelector('main form [role="status"]');
  let saved = JSON.parse(sql(`select profile_json from cvs where id='${cvId}'`));
  check("edits are saved as a draft", saved.headline === "Senior Backend Developer" && !saved.skills.includes("Python") && saved.experience[0].bullets[3] === "Led the migration to Python 3.12", JSON.stringify(saved).slice(0, 300));
  check("saving a draft does not approve it", sql(`select approved from cvs where id='${cvId}'`) === "f");
  await p.reload();
  check("edits survive a reload", (await p.getByLabel("Headline").inputValue()) === "Senior Backend Developer");
  await p.getByLabel("Name", { exact: true }).fill("");
  await p.getByRole("button", { name: "Approve as my master CV" }).click();
  await p.waitForSelector('main form [role="alert"]');
  check("cannot approve without a name", /Add your name/.test(await formError(p)));
  await p.getByLabel("Name", { exact: true }).fill("Priya Shah");
  await p.getByRole("button", { name: "Approve as my master CV" }).click();
  await p.waitForURL("**/cvs?approved=1");
  check("approve makes it the master CV", sql(`select approved from cvs where id='${cvId}'`) === "t" && (await p.textContent("main")).includes("Master CV"));

  // --- another user cannot see it
  const p2 = await (await browser.newContext()).newPage();
  await logIn(p2, owner);
  const res = await p2.goto(`${APP}/cvs/${cvId}/review`);
  check("another user gets 404 for this CV", res.status() === 404, res.status());

  // --- second CV (Word), approving swaps the master
  await upload(p, `${FIX}/sample.docx`);
  check("Word upload lands on the review page", p.url().endsWith("/review"), (await formError(p)) || p.url());
  const cv2 = p.url().split("/").slice(-2)[0];
  check("first CV is still the master while the new one is unapproved", sql(`select string_agg(id::text, ',') from cvs where approved`) === cvId);
  await p.getByRole("button", { name: "Approve as my master CV" }).click();
  await p.waitForURL("**/cvs?approved=1");
  check("only one master CV at a time", sql(`select string_agg(id::text, ',') from cvs where approved`) === cv2);

  // --- text file, then delete
  await upload(p, `${FIX}/sample.txt`);
  check("text upload lands on the review page", p.url().endsWith("/review"), (await formError(p)) || p.url());
  const before = sql("select count(*) from cvs") + "/" + sql("select count(*) from storage.objects");
  await p.goto(`${APP}/cvs`);
  await p.getByRole("button", { name: "Delete" }).first().click();
  await p.waitForFunction(() => document.querySelectorAll("main li").length === 2);
  const after = sql("select count(*) from cvs") + "/" + sql("select count(*) from storage.objects");
  check("delete removes the CV and its stored file", before === "3/3" && after === "2/2", `${before} -> ${after}`);

  await browser.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : `\nALL CV CHECKS PASSED (${MODE})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
