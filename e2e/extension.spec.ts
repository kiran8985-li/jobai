import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { PASSWORD, assertLocal, makeUser, resetDatabase, sql } from "./helpers";

/**
 * Prompt 12: the real extension, loaded into Chromium, filling a Greenhouse-style and a Lever-style
 * form, never submitting, and doing nothing on LinkedIn or Indeed. With PROOF_DIR set it saves
 * screenshots of every step.
 */
// The extension APIs exist inside the extension's own pages, where these callbacks run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const PROOF = process.env.PROOF_DIR;
const EXT = path.resolve("extension");
const FIX = path.resolve("e2e/fixtures");
const shot = async (p: Page, name: string, full = true) => { if (PROOF) await p.screenshot({ path: `${PROOF}/${name}.png`, fullPage: full }); };

// Sample employer sites. Plain http on 127.0.0.1, and https for the blocked sites (mapped to this machine).
function serveFixtures() {
  const handler: http.RequestListener = (req, res) => {
    const url = req.url || "/";
    const file = url.startsWith("/acme/jobs/4001") ? "greenhouse.html" : url.startsWith("/zeta/py-777") ? "lever.html" : url.startsWith("/jobs/view") || url.startsWith("/viewjob") ? "greenhouse.html" : null;
    if (!file) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(path.join(FIX, file)));
  };
  const dir = mkdtempSync(path.join(tmpdir(), "jp-cert-"));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=localhost" -keyout ${dir}/k.pem -out ${dir}/c.pem 2>/dev/null`);
  const plain = http.createServer(handler).listen(4020, "127.0.0.1");
  const secure = https.createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, handler).listen(4443, "127.0.0.1");
  return () => { plain.close(); secure.close(); };
}

async function popupFor(ctx: BrowserContext, extId: string, target: Page): Promise<Page> {
  // The popup is opened as a page aimed at the form's tab (people click the toolbar icon instead).
  const helper = await ctx.newPage();
  await helper.goto(`chrome-extension://${extId}/popup.html`);
  const tabId = await helper.evaluate(async (u) => (await chrome.tabs.query({})).find((t: { url: string }) => t.url === u)?.id, target.url());
  await helper.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}`);
  await helper.setViewportSize({ width: 360, height: 640 });
  return helper;
}

test("the extension fills Greenhouse and Lever forms, never submits, and does nothing on blocked sites", async ({ page }) => {
  test.setTimeout(420_000);
  assertLocal();
  const stop = serveFixtures();
  try {
    await resetDatabase();
    const run = String(Date.now()).slice(-6);
    await makeUser(`owner${run}@example.com`, "Olivia Owner");
    const email = `priya${run}@example.com`;
    const userId = await makeUser(email, "Priya Shah");

    // ---------- set up in the app, through its pages
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('main button[type="submit"]');
    await page.waitForURL("**/dashboard");
    await page.goto("/onboarding");
    await page.check('input[name="consent"]');
    await page.click('main button[type="submit"]');
    const cv = readFileSync("reference/sample_cv.txt", "utf8").replace("Location: Manchester, UK\n", "Location: Manchester, UK\nlinkedin.com/in/priya-shah-dev | github.com/priyashah\n");
    const cvFile = path.join(mkdtempSync(path.join(tmpdir(), "jp-cv-")), "priya_cv.txt");
    writeFileSync(cvFile, cv);
    await page.setInputFiles('input[type="file"]', cvFile);
    await page.click('main button[type="submit"]');
    await page.waitForURL("**/review");
    await page.getByRole("button", { name: "Approve as my master CV" }).click();
    await page.waitForURL("**/onboarding/preferences");
    await page.fill('main input[name="name"]', "Python jobs");
    await page.fill('main input[name="roles"]', "Python Developer, Backend Engineer");
    await page.click('main button[type="submit"]');
    await page.waitForURL("**/auto-apply?welcome=1");
    await page.selectOption('select[name="right_to_work_uk"]', "yes");
    await page.fill('input[name="notice_period"]', "1 month");
    await page.fill('input[name="salary_expectation"]', "£55,000 to £60,000");
    await page.getByRole("button", { name: "Add an answer" }).click();
    await page.getByLabel("Question 1").fill("Do you have a driving licence?");
    await page.getByLabel("Answer 1").fill("Yes, full UK licence");
    await page.getByRole("button", { name: "Save screening answers" }).click();
    await expect(page.getByText("Screening answers saved.")).toBeVisible();

    // Two jobs on employer sites, matched for this user, each with a tailored CV made in the app.
    const pid = sql(`select id from search_profiles where user_id='${userId}'`);
    sql(`insert into jobs (source, external_id, title, company, location, description, apply_url, apply_method, dedupe_key) values
      ('greenhouse','acme:4001','Backend Engineer','Acme Fintech','London','Python, Flask, PostgreSQL, Docker, AWS','http://127.0.0.1:4020/acme/jobs/4001','ats','gh4001'),
      ('lever','zeta:py-777','Python Engineer','Zeta','London','Python, SQL, Docker, testing','http://127.0.0.1:4020/zeta/py-777','ats','lv777')`);
    for (const ext of ["acme:4001", "zeta:py-777"]) {
      sql(`insert into matches (user_id, search_profile_id, job_id, score, breakdown) select '${userId}', '${pid}', id, 92, '{"role":{"points":35,"max":35,"reason":"Title matches"},"skills":{"points":37,"max":45,"reason":"5 of 6 skills"},"location":{"points":10,"max":10,"reason":"In London"},"salary":{"points":10,"max":10,"reason":"No minimum"}}' from jobs where external_id='${ext}'`);
      await page.goto(`/jobs/${sql(`select id from jobs where external_id='${ext}'`)}`);
      await page.getByRole("button", { name: "Create a tailored CV" }).click();
      await page.waitForURL("**cv=made**");
    }

    // Connection code from the app's Browser extension page.
    await page.goto("/account");
    await page.getByRole("link", { name: "Set up the extension" }).click();
    await page.getByRole("button", { name: "Get a connection code" }).click();
    const code = (await page.locator("[data-code]").textContent())!.trim();
    expect(code).toMatch(/^jpx_/);
    expect(sql(`select count(*) from extension_tokens where user_id='${userId}' and token_hash <> '${code}'`)).toBe("1");
    await shot(page, "x01-app-connection-code");

    // ---------- the real extension in Chromium
    const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "jp-chrome-")), {
      channel: "chromium",
      headless: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 900, height: 900 },
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--host-resolver-rules=MAP www.linkedin.com 127.0.0.1:4443, MAP uk.indeed.com 127.0.0.1:4443", "--ignore-certificate-errors", "--no-proxy-server"],
    });
    try {
      let [sw] = ctx.serviceWorkers();
      if (!sw) sw = await ctx.waitForEvent("serviceworker");
      const extId = sw.url().split("/")[2];

      // Greenhouse-style form.
      const gh = await ctx.newPage();
      await gh.goto("http://127.0.0.1:4020/acme/jobs/4001");
      await shot(gh, "x02-greenhouse-before");
      let popup = await popupFor(ctx, extId, gh);
      await expect(popup.locator("#connect")).toBeVisible();
      await popup.fill("#appUrl", process.env.E2E_BASE_URL ?? "http://localhost:3000");
      await popup.fill("#code", "jpx_this-code-is-not-real-1234567");
      await popup.click("#connectBtn");
      await expect(popup.locator("#message")).toContainText("That code did not work");
      await popup.fill("#code", code);
      await popup.click("#connectBtn");
      await expect(popup.locator("#ready")).toBeVisible();
      await expect(popup.locator(".job")).toContainText("Backend Engineer");
      await expect(popup.locator(".job")).toContainText("Your tailored CV for this job will be attached.");
      await shot(popup, "x03-popup-ready", false);
      await popup.click("#fillBtn");
      await expect(popup.locator("#result")).toBeVisible();
      await shot(popup, "x04-popup-greenhouse-result", false);

      const v = (sel: string) => gh.locator(sel).inputValue();
      expect(await v("#first_name")).toBe("Priya");
      expect(await v("#last_name")).toBe("Shah");
      expect(await v("#email")).toBe("priya.shah@example.com");
      expect(await v("#phone")).toBe("07700 900123");
      expect(await v("#location")).toBe("Manchester, UK");
      expect(await v("#q_linkedin")).toBe("https://linkedin.com/in/priya-shah-dev");
      expect(await v("#q_rtw")).toBe("1"); // Yes
      expect(await v("#q_sponsor")).toBe("0"); // No: right to work without sponsorship
      expect(await v("#q_notice")).toBe("1 month");
      const file = await gh.evaluate(() => { const f = (document.getElementById("resume") as HTMLInputElement).files?.[0]; return f ? { name: f.name, size: f.size, type: f.type } : null; });
      expect(file).toEqual({ name: "Priya-Shah-CV-Acme-Fintech.pdf", size: expect.any(Number), type: "application/pdf" });
      expect(file!.size).toBeGreaterThan(5000);
      // Sensitive questions untouched and highlighted; unknown ones highlighted; nothing submitted.
      for (const id of ["gender", "hispanic", "race", "veteran", "disability"]) {
        expect(await v(`#${id}`), id).toBe("");
        expect(await gh.locator(`#${id}`).getAttribute("data-jobpilot"), id).toBe("sensitive");
      }
      // "How did you hear" is answered truthfully for every user; the privacy tick box is always left to them.
      expect(await v("#q_hear")).toBe("Online job search");
      expect(await gh.locator("#q_privacy").getAttribute("data-jobpilot")).toBe("unanswered");
      expect(await gh.locator("#q_privacy").isChecked()).toBe(false);
      expect(await v("#q_website")).toBe("");
      expect(await gh.evaluate(() => ({ s: (window as unknown as { submitAttempts: number }).submitAttempts, c: (window as unknown as { submitClicks?: number }).submitClicks ?? 0 }))).toEqual({ s: 0, c: 0 });
      expect(await gh.title()).not.toBe("SUBMITTED");
      await expect(gh.locator("#jobpilot-banner")).toContainText("press Submit yourself");
      const report = await popup.locator("#result").textContent();
      expect(report).toMatch(/Filled 11 fields, attached Priya-Shah-CV-Acme-Fintech\.pdf/);
      expect(report).toMatch(/Never answered by JobPilot AI \(5\)/);
      await shot(gh, "x05-greenhouse-filled");

      // Mark as applied from the extension.
      await popup.click("#appliedBtn");
      await expect(popup.locator("#message")).toContainText("Saved in JobPilot AI as applied.");
      expect(sql(`select status || '|' || (detail->>'via') from applications a join jobs j on j.id=a.job_id where j.external_id='acme:4001'`)).toBe("sent|browser extension");

      // Lever-style form.
      const lv = await ctx.newPage();
      await lv.goto("http://127.0.0.1:4020/zeta/py-777/apply");
      popup = await popupFor(ctx, extId, lv);
      await expect(popup.locator(".job")).toContainText("Python Engineer");
      await popup.click("#fillBtn");
      await expect(popup.locator("#result")).toBeVisible();
      const lval = (name: string) => lv.locator(`[name="${name}"]`).inputValue();
      expect(await lval("name")).toBe("Priya Shah");
      expect(await lval("email")).toBe("priya.shah@example.com");
      expect(await lval("phone")).toBe("07700 900123");
      expect(await lval("org")).toBe("Northwind Digital Ltd");
      expect(await lval("urls[LinkedIn]")).toBe("https://linkedin.com/in/priya-shah-dev");
      expect(await lval("urls[GitHub]")).toBe("https://github.com/priyashah");
      expect(await lval("cards[q2][field0]")).toBe("£55,000 to £60,000");
      expect(await lval("cards[q3][field0]")).toBe("Yes, full UK licence");
      expect(await lv.locator('input[name="cards[q1][field0]"][value="Yes"]').isChecked()).toBe(true);
      expect(await lval("eeo[gender]")).toBe("");
      expect(await lval("eeo[race]")).toBe("");
      expect(await lval("comments")).toBe("");
      expect(await lv.evaluate(() => (document.getElementById("resume-upload-input") as HTMLInputElement).files?.[0]?.name)).toBe("Priya-Shah-CV-Zeta.pdf");
      expect(await lv.evaluate(() => (window as unknown as { submitAttempts: number }).submitAttempts)).toBe(0);
      await shot(lv, "x06-lever-filled");
      await shot(popup, "x07-popup-lever-result", false);

      // LinkedIn and Indeed: the extension does nothing, even if asked directly.
      for (const [url, name] of [["https://www.linkedin.com/jobs/view/123", "linkedin"], ["https://uk.indeed.com/viewjob?jk=abc", "indeed"]]) {
        const blocked = await ctx.newPage();
        await blocked.goto(url);
        expect(await blocked.locator("#first_name").count()).toBe(1); // the page loaded
        const p = await popupFor(ctx, extId, blocked);
        await expect(p.locator("#blocked")).toBeVisible();
        await expect(p.locator("#fillBtn")).toBeHidden();
        if (name === "linkedin") await shot(p, "x08-popup-blocked-linkedin", false);
        const tabId = await p.evaluate(async (u) => (await chrome.tabs.query({})).find((t: { url: string }) => t.url === u)?.id, blocked.url());
        const forced = await p.evaluate(async (id) => chrome.runtime.sendMessage({ type: "fill", tabId: id, jobId: null }), tabId);
        expect(forced).toEqual({ blocked: true });
        expect(await blocked.locator("#first_name").inputValue()).toBe("");
        expect(await blocked.locator("#jobpilot-banner").count()).toBe(0);
        expect(await blocked.evaluate(() => "__jobpilotFill" in window)).toBe(false);
        await p.close();
      }

      // Stored: only the site address and the code. No CV details, in local or session storage.
      const stored = await popup.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
      expect(Object.keys(stored.local).sort()).toEqual(["appUrl", "token"]);
      expect(stored.session).toEqual({});
      expect(JSON.stringify(stored)).not.toMatch(/Priya|07700|Northwind|example\.com"/);

      // Disconnect: the code stops working at once.
      await popup.click("#disconnectBtn");
      await expect(popup.locator("#connect")).toBeVisible();
      expect(sql(`select count(*) from extension_tokens where user_id='${userId}'`)).toBe("0");
      const after = await fetch(`${process.env.E2E_BASE_URL ?? "http://localhost:3000"}/api/extension/profile`, { method: "POST", headers: { authorization: `Bearer ${code}`, "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com" }) });
      expect(after.status).toBe(401);
    } finally {
      await ctx.close();
    }

    // The application now shows as Sent in the app.
    await page.goto("/applications");
    await expect(page.locator('[data-application="Backend Engineer"]')).toContainText("Sent");
    await shot(page, "x09-app-applications-sent");
  } finally {
    stop();
  }
});

test("extension API refuses missing, wrong and expired codes", async () => {
  assertLocal();
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const call = (auth?: string) => fetch(`${base}/api/extension/profile`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ url: "https://example.com" }) });
  expect((await call()).status).toBe(401);
  expect((await call("Bearer jpx_wrong-wrong-wrong-wrong-wrong")).status).toBe(401);
  expect((await call("Bearer something-else")).status).toBe(401);
  const run = String(Date.now()).slice(-6);
  const userId = await makeUser(`exp${run}@example.com`, "Ed Expired");
  const token = "jpx_expired-token-for-testing-0001";
  const hash = execSync(`printf %s '${token}' | sha256sum`).toString().split(" ")[0];
  sql(`insert into extension_tokens (user_id, token_hash, expires_at) values ('${userId}', '${hash}', now() - interval '1 minute')`);
  expect((await call(`Bearer ${token}`)).status).toBe(401);
  sql(`update extension_tokens set expires_at = now() + interval '1 hour' where user_id='${userId}'`);
  expect((await call(`Bearer ${token}`)).status).toBe(200);
  sql(`update profiles_user set is_active=false where id='${userId}'`);
  expect((await call(`Bearer ${token}`)).status).toBe(401);
});
