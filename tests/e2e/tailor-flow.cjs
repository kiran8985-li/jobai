// End-to-end check of Prompt 6 against a LOCAL Supabase, `npm run dev` and tests/e2e/fake-ai.cjs.
// Needs DEMO_SOURCE=true, CRON_SECRET and DEEPSEEK_* pointing at the fake AI in .env.local.
// Run: node --env-file=.env.local tests/e2e/tailor-flow.cjs   (never against a real project)
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
const cron = () => fetch(`${APP}/api/cron/scan`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
const jobId = (title) => sql(`select id from jobs where title='${title}'`);
async function pdfText(bytes) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const res = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false });
  return res.text.join("\n").replace(/\s+/g, " ");
}

(async () => {
  await admin.storage.emptyBucket("cvs");
  await admin.storage.emptyBucket("tailored");
  sql("truncate auth.users cascade; delete from public.invites; truncate public.jobs cascade; truncate public.scan_runs; truncate public.source_status; delete from public.ai_usage; update public.app_settings set value='invite'");
  await fetch("http://127.0.0.1:4010/reset");
  const run = String(Date.now()).slice(-6);
  const owner = `owner${run}@example.com`, alice = `alice${run}@example.com`;
  await makeUser(owner, "Olivia Owner");
  const aliceId = await makeUser(alice, "Alice Tester");
  await cron();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const p = await ctx.newPage();
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
  await p.fill('main input[name="roles"]', "Python Developer, Software Developer");
  await p.click('main button[type="submit"]');
  await p.waitForURL("**/auto-apply?welcome=1");
  check("saving a search does not create tailored CVs by itself", sql("select count(*) from tailored_cvs") === "0");

  // --- create on demand: AI version, fact-checked
  const py = jobId("Python Developer");
  await p.goto(`${APP}/jobs/${py}`);
  check("job page offers to create a tailored CV", (await p.getByRole("button", { name: "Create a tailored CV" }).count()) === 1);
  await p.getByRole("button", { name: "Create a tailored CV" }).click();
  await p.waitForURL("**cv=made**");
  await p.getByText("Your tailored CV is ready").waitFor();
  let row = JSON.parse(sql(`select row_to_json(t) from (select method, flags, content_json, pdf_path, docx_path from tailored_cvs where job_id='${py}') t`));
  check("the AI version is used after the fact check", row.method === "ai", row.method);
  const body = JSON.stringify(row.content_json);
  check("the invented skill and bullet are not in the CV", !/Kubernetes|blockchain|9 banks/.test(body), body.slice(0, 200));
  check("each removal is recorded as a flag", row.flags.length === 2 && /Kubernetes/.test(row.flags.join()) && /blockchain/.test(row.flags.join()), row.flags.join(" | "));
  check("honest rewording is kept, with wanted skills first", row.content_json.experience[0].bullets[0] === "Cut AWS costs by 30% by moving batch jobs to Docker on ECS" && row.content_json.skills.slice(0, 3).join() === "AWS,Docker,PostgreSQL", JSON.stringify(row.content_json.skills));
  check("employers, titles, dates and contact details equal the master", row.content_json.experience[0].company === "Northwind Digital Ltd" && row.content_json.experience[1].dates === "Jun 2018 - Feb 2021" && row.content_json.name === "Priya Shah" && row.content_json.email === "priya.shah@example.com");
  const text = await main(p);
  check("the page shows the preview and the fact-check panel", text.includes("Tailored with AI, then fact-checked") && text.includes("Fact check: 2 things were removed") && text.includes("Northwind Digital Ltd"));
  check("job page with preview: no sideways scroll at 375 px", await noScroll(p));
  check("both files are stored in the user's private folder", row.pdf_path === `${aliceId}/${py}.pdf` && sql(`select count(*) from storage.objects where bucket_id='tailored' and name like '${aliceId}/%'`) === "2");

  // --- downloads
  let res = await p.request.get(`${APP}/api/cvs/tailored/${py}/pdf`);
  let bytes = await res.body();
  check("PDF download works with a sensible file name", res.status() === 200 && res.headers()["content-type"] === "application/pdf" && /filename="Priya-Shah-CV-Fernhill-Software\.pdf"/.test(res.headers()["content-disposition"]) && bytes.subarray(0, 5).toString() === "%PDF-", res.status() + " " + res.headers()["content-disposition"]);
  const extracted = await pdfText(bytes);
  check("the PDF's text can be read back out (ATS-readable) and matches the CV", extracted.includes("Priya Shah") && extracted.includes("Northwind Digital Ltd") && extracted.includes("Cut AWS costs by 30%") && !/Kubernetes|blockchain/.test(extracted), extracted.slice(0, 200));
  res = await p.request.get(`${APP}/api/cvs/tailored/${py}/docx`);
  bytes = await res.body();
  const mammoth = require("mammoth");
  const word = (await mammoth.extractRawText({ buffer: bytes })).value;
  check("Word download works and opens", res.status() === 200 && bytes[0] === 0x50 && bytes[1] === 0x4b && word.includes("Priya Shah") && word.includes("Cut AWS costs by 30%") && /\.docx"/.test(res.headers()["content-disposition"]));
  res = await p.request.get(`${APP}/api/cvs/master/pdf`);
  check("master CV downloads as PDF and Word", res.status() === 200 && (await pdfText(await res.body())).includes("Reduced AWS costs by 30%") && (await p.request.get(`${APP}/api/cvs/master/docx`)).status() === 200);
  check("unknown formats and jobs give 404", (await p.request.get(`${APP}/api/cvs/tailored/${py}/exe`)).status() === 404 && (await p.request.get(`${APP}/api/cvs/tailored/${jobId("Accounts Assistant")}/pdf`)).status() === 404);

  // --- privacy
  const p2 = await (await browser.newContext()).newPage();
  check("signed-out download is refused", (await p2.request.get(`${APP}/api/cvs/tailored/${py}/pdf`, { maxRedirects: 0 })).status() === 401);
  await logIn(p2, owner);
  check("another user cannot download this CV", (await p2.request.get(`${APP}/api/cvs/tailored/${py}/pdf`)).status() === 404 && (await p2.request.get(`${APP}/api/cvs/master/pdf`)).status() === 404);
  const asOwner = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await asOwner.auth.signInWithPassword({ email: owner, password: PW });
  const direct = await asOwner.storage.from("tailored").download(`${aliceId}/${py}.pdf`);
  const rows = await asOwner.from("tailored_cvs").select("job_id");
  const plant = await asOwner.storage.from("tailored").upload(`${aliceId}/evil.pdf`, "x", { contentType: "application/pdf" });
  check("another user cannot read the file or row directly, or write to the folder", !!direct.error && rows.data.length === 0 && !!plant.error);
  const sent = (await (await fetch("http://127.0.0.1:4010/requests")).json()).filter((r) => r.body.includes("CV TO TAILOR")).map((r) => r.body).join("\n");
  check("tailoring requests carry no name, contact details, employers or education", sent.includes("Reduced AWS costs by 30%") && !/priya|shah|07700|Manchester|Northwind|Brightside|University of Leeds/i.test(sent));

  // --- the scan tailors the remaining matches; a mostly-invented AI reply falls back
  await cron();
  const made = sql(`select string_agg(j.title || ':' || t.method, ', ' order by j.title) from tailored_cvs t join jobs j on j.id=t.job_id where t.user_id='${aliceId}'`);
  check("the scan prepares a CV for every match, and only for matches", made === "Python Developer:ai, Python Developer (Contract):reorder", made);
  check("a job the AI check ruled out is no longer a match, so no CV is made for it", sql(`select score from matches where job_id='${jobId("Software Developer")}'`) === "74");
  row = JSON.parse(sql(`select row_to_json(t) from (select method, flags, content_json from tailored_cvs where job_id='${jobId("Python Developer (Contract)")}') t`));
  const allBullets = row.content_json.experience.flatMap((e) => e.bullets).sort().join("|");
  check("a mostly-invented AI reply is discarded for reorder-only, with the reason shown", /discarded/.test(row.flags[0]) && !/Google|Kubernetes|rocket/.test(JSON.stringify(row.content_json)) && allBullets.includes("Mentored 3 junior developers") && row.content_json.experience.length === 2, row.flags.join(" | "));
  check("AI tailoring calls are logged for cost tracking", Number(sql("select count(*) from ai_usage where purpose='cv_tailor' and ok")) === 2);
  await cron();
  check("a later scan does not remake existing CVs", Number(sql("select count(*) from ai_usage where purpose='cv_tailor'")) === 2);

  // --- My CVs
  await p.goto(`${APP}/cvs`);
  const cvs = await main(p);
  check("My CVs lists the tailored CVs with their fact-check result", (await p.locator("[data-tailored]").count()) === 2 && cvs.includes("2 removed by fact check") && cvs.includes("Reordered, no AI"));
  await p.locator('[data-tailored="Python Developer"] summary').click();
  check("the flags panel opens and names what was removed", /Kubernetes/.test(await p.locator('[data-tailored="Python Developer"]').textContent()));
  check("My CVs offers master and tailored downloads", (await p.getByRole("link", { name: "Download PDF" }).count()) === 3 && (await p.getByRole("link", { name: "Download Word" }).count()) === 3);
  check("My CVs: no sideways scroll at 375 px", await noScroll(p));

  // --- changing the master CV clears tailored CVs made from the old one
  const cvId = sql(`select id from cvs where user_id='${aliceId}' and approved`);
  await p.goto(`${APP}/cvs/${cvId}/review`);
  await p.getByLabel("Headline").fill("Senior Backend Developer");
  await p.getByRole("button", { name: "Save changes to my master CV" }).click();
  await p.waitForURL("**/cvs?approved=1");
  check("editing the master CV removes tailored CVs made from the old one", sql(`select count(*) from tailored_cvs where user_id='${aliceId}'`) === "0");
  await p.goto(`${APP}/jobs/${py}`);
  await p.getByRole("button", { name: "Create a tailored CV" }).click();
  await p.waitForURL("**cv=made**");
  check("a new one uses the updated master CV", sql(`select content_json->>'headline' from tailored_cvs where job_id='${py}'`) === "Senior Backend Developer");

  await browser.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL TAILORING CHECKS PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
