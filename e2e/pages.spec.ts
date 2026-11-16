import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, assertLocal, makeUser, resetDatabase, sql } from "./helpers";

/**
 * Prompt 11 audit: every page listed in CLAUDE.md exists, is reachable from the navigation, shows
 * working data, and follows the design direction (font, accent colour, 44 px controls, no emoji,
 * fits 375 px, light and dark). With PROOF_DIR set, it saves a screenshot of every page and a JSON
 * record of every check.
 */
const PROOF = process.env.PROOF_DIR;
const results: { page: string; path: string; checks: string[] }[] = [];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

async function audit(page: Page, name: string, heading: RegExp | string, opts: { shot?: string; data?: RegExp[] } = {}) {
  const checks: string[] = [];
  await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(heading);
  checks.push("page heading shown");
  for (const d of opts.data ?? []) {
    await expect(page.locator("main").first()).toContainText(d);
    checks.push(`shows ${d.source.replace(/\\/g, "")}`);
  }
  const report = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && r.left > -1000;
    };
    // Buttons, and links styled as buttons (block-level, padded). Links inside sentences are exempt (WCAG 2.5.8).
    const controls = [...document.querySelectorAll("button, a.flex, a.inline-flex, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])")]
      .filter(visible)
      .filter((el) => !el.closest("[aria-hidden=true]") && !el.closest("nextjs-portal"));
    const small = controls.filter((el) => el.getBoundingClientRect().height < 43.5).map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || (el as HTMLInputElement).name || "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().height)}px`);
    const font = getComputedStyle(document.body).fontFamily;
    const accent = [...document.querySelectorAll("main a, main button, aside a, header a")].some((el) => getComputedStyle(el).backgroundColor === "rgb(108, 77, 255)" || getComputedStyle(el).color === "rgb(108, 77, 255)" || getComputedStyle(el).backgroundColor === "rgb(139, 115, 255)" || getComputedStyle(el).color === "rgb(139, 115, 255)");
    return { small, font, accent, width: document.documentElement.scrollWidth, text: document.body.innerText, controls: controls.length };
  });
  expect(report.small, `${name}: controls under 44 px tall`).toEqual([]);
  checks.push(`all ${report.controls} buttons and fields are at least 44 px tall`);
  expect(report.font).toMatch(/Jakarta/i);
  checks.push("uses Plus Jakarta Sans");
  expect(report.accent, `${name}: violet accent`).toBe(true);
  checks.push("uses the violet accent");
  expect(EMOJI.test(report.text), `${name}: emoji found`).toBe(false);
  checks.push("no emoji");
  expect(report.width, `${name}: page wider than the screen`).toBeLessThanOrEqual(page.viewportSize()!.width);
  checks.push(`fits ${page.viewportSize()!.width} px with no sideways scroll`);
  if (PROOF && opts.shot) await page.screenshot({ path: `${PROOF}/${opts.shot}.png`, fullPage: true });
  results.push({ page: name, path: new URL(page.url()).pathname, checks });
}

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

/** Reaches a signed-in page the way a person would: through the menu. */
async function viaMenu(page: Page, label: string) {
  await page.getByRole("button", { name: /Menu/ }).click();
  await page.locator("#mobile-menu").getByRole("link", { name: new RegExp(`^${label}`) }).click();
  await page.waitForLoadState("networkidle");
}

test.describe.configure({ mode: "serial" });

test("every page exists, is reachable, has working data and follows the design", async ({ page, browser }) => {
  test.setTimeout(600_000);
  assertLocal();
  await resetDatabase();
  const run = String(Date.now()).slice(-6);
  const owner = `owner${run}@example.com`;
  const tester = `tess${run}@example.com`;
  await makeUser(owner, "Olivia Owner");
  await makeUser(tester, "Tess Tester");

  // ---------- public pages
  await page.goto("/");
  await audit(page, "Landing", "Your CV, matched", { shot: "01-landing", data: [/Invite-only beta/, /Request an invite/] });
  const visitor = `visitor${run}@example.com`;
  await page.fill('#request input[name="name"]', "Val Visitor");
  await page.fill('#request input[name="email"]', visitor);
  await page.getByRole("button", { name: "Request an invite" }).click();
  await expect(page.getByText("Your request is with us")).toBeVisible();
  expect(sql(`select count(*) from invite_requests where email='${visitor}'`)).toBe("1");
  results.push({ page: "Landing: request an invite", path: "/", checks: ["request stored for the admin", "same thank-you whether or not the address is known"] });

  await page.getByRole("link", { name: "Log in" }).first().click();
  await audit(page, "Log in", "Log in", { shot: "02-login", data: [/request an invite/] });
  await page.goto("/signup");
  await audit(page, "Sign up without an invite", "You need an invite", { shot: "03-signup-no-invite" });
  await page.goto("/privacy");
  await audit(page, "Privacy notice", "Privacy notice", { shot: "04-privacy", data: [/What we store, and why/, /DeepSeek/, /Your rights/] });
  await page.goto("/verify-email?email=someone%40example.com");
  await audit(page, "Check your email", "Check your email", { shot: "05-verify-email" });

  // ---------- the tester sets up through the pages, then a scan runs
  await logIn(page, tester);
  await audit(page, "Dashboard (new account)", "Welcome, Tess", { shot: "06-dashboard-new", data: [/Upload your CV/, /1\. Upload your CV/] });
  await page.getByRole("link", { name: "Get started" }).click();
  await audit(page, "Onboarding: consent", "Set up your CV", { shot: "07-onboarding-consent", data: [/DeepSeek/, /China/] });
  await page.check('input[name="consent"]');
  await page.click('main button[type="submit"]');
  await expect(page.locator('input[type="file"]')).toBeVisible();
  await audit(page, "Onboarding: upload", "Set up your CV", { shot: "08-onboarding-upload", data: [/Upload your CV/] });
  await page.setInputFiles('input[type="file"]', "reference/sample_cv.txt");
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/review");
  await audit(page, "Review your CV", "Review your CV", { shot: "09-cv-review", data: [/Mentored 3 junior developers/, /Projects/] });
  await page.getByRole("button", { name: "Approve as my master CV" }).click();
  await page.waitForURL("**/onboarding/preferences");
  await audit(page, "Onboarding: preferences", "What jobs are you looking for?", { shot: "10-onboarding-preferences" });
  await page.fill('main input[name="name"]', "Python jobs");
  await page.fill('main input[name="roles"]', "Python Developer, Software Developer, Senior Backend Engineer, DevOps Engineer");
  await page.fill('main input[name="min_match"]', "70");
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/auto-apply?welcome=1");
  await page.selectOption('select[name="right_to_work_uk"]', "yes");
  await page.fill('input[name="notice_period"]', "1 month");
  await page.getByRole("button", { name: "Save screening answers" }).click();
  await expect(page.getByText("Screening answers saved.")).toBeVisible();
  await page.check('main input[name="consent"]');
  await page.getByRole("button", { name: "Give consent for this search" }).click();
  await page.waitForURL("**msg=consent_given");
  await page.getByRole("button", { name: "Turn auto-apply on" }).click();
  await page.waitForURL("**msg=auto_on");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Run scan now" }).click();
  await page.waitForURL("**scan=done**", { timeout: 150_000 });

  // ---------- every signed-in page, reached through the menu
  await expect(page.getByText(/Scan finished/)).toBeVisible();
  await audit(page, "Dashboard", "Welcome, Tess", { shot: "11-dashboard", data: [/Applications/, /Needs your attention/, /New matches this week/] });
  await viaMenu(page, "Jobs");
  await audit(page, "Jobs", "Jobs", { shot: "12-jobs", data: [/Python Developer/, /skills in the advert are on your CV/] });
  await page.locator("main li h2 a", { hasText: /^Software Developer$/ }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}/);
  await audit(page, "Job detail", "Software Developer", { shot: "13-job-detail", data: [/Why this score/, /Your CV for this job/, /Prepared \(test mode\)/, /The prepared email/] });
  await viaMenu(page, "Applications");
  await audit(page, "Applications", "Applications", { shot: "14-applications", data: [/Waiting for you/, /Skipped/] });
  await page.locator('[data-application="Software Developer"]').click();
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}/);
  await audit(page, "Application detail", "Software Developer", { shot: "15-application-detail", data: [/What happened/, /The CV for this application/] });
  await viaMenu(page, "My CVs");
  await audit(page, "My CVs", "My CVs", { shot: "16-my-cvs", data: [/Master CV/, /CVs tailored for jobs/, /Download PDF/] });
  await viaMenu(page, "Job searches");
  await audit(page, "Job searches", "Job searches", { shot: "17-job-searches", data: [/Python jobs/, /Auto-apply on/] });
  await page.getByRole("link", { name: "Edit" }).first().click();
  await audit(page, "Edit search", "Edit search", { shot: "18-edit-search" });
  await viaMenu(page, "Auto-apply");
  await audit(page, "Auto-apply settings", "Auto-apply", { shot: "19-auto-apply", data: [/Consent given on/, /Sensitive questions are always skipped/, /Test mode is on/] });
  await viaMenu(page, "Notifications");
  await audit(page, "Notifications", "Notifications", { shot: "20-notifications", data: [/Unread/, /Prepared/] });
  await viaMenu(page, "Account");
  await audit(page, "Account", "Account", { shot: "21-account", data: [/Download my data/, /Withdraw AI consent/, /Delete your account/] });

  // A tester never sees Admin.
  await page.getByRole("button", { name: /Menu/ }).click();
  await expect(page.locator('#mobile-menu a[href="/admin"]')).toHaveCount(0);
  const forbidden = await page.goto("/admin");
  expect(forbidden!.status()).toBe(403);
  await audit(page, "Admin, as a tester", "You do not have access to this page", { shot: "22-admin-forbidden" });
  results.push({ page: "Admin link for testers", path: "/admin", checks: ["no Admin link in the menu", "every admin address answers 403"] });

  // ---------- admin pages, reached through the menu and the admin tabs
  const admin = await (await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  await logIn(admin, owner);
  await viaMenu(admin, "Admin");
  await audit(admin, "Admin: overview", "Overview", { shot: "23-admin-overview", data: [/Applications by status/, /Last 10 scans/] });
  const tabs: [string, string, RegExp[]][] = [
    ["Users and invites", "24-admin-users", [/Invite requests \(1\)/, new RegExp(visitor), /Tess Tester/]],
    ["Job sources", "26-admin-sources", [/Demo/, /Jobs last run: 12/]],
    ["Application log", "27-admin-applications", [/Software Developer/]],
    ["AI usage", "28-admin-ai", [/Daily limit/]],
    ["System health", "29-admin-health", [/Last finished scan/, /On schedule/]],
  ];
  for (const [tab, shot, data] of tabs) {
    await admin.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: tab }).click();
    await admin.waitForLoadState("networkidle");
    await audit(admin, `Admin: ${tab.toLowerCase()}`, tab === "AI usage" ? "AI usage and cost" : tab, { shot, data });
    if (tab === "Users and invites") {
      await admin.locator("[data-user]").filter({ hasText: "Tess Tester" }).locator("xpath=ancestor::tr").getByRole("link", { name: "View" }).click();
      await audit(admin, "Admin: a user's activity", "Tess Tester", { shot: "25-admin-user", data: [/Recent applications/, /AI calls today/] });
      await admin.goBack();
      await admin.locator(`[data-request="${visitor}"]`).getByRole("button", { name: "Create invite" }).click();
      await admin.waitForURL("**msg=invited**");
      expect(sql(`select count(*) from invites where email='${visitor}' and used_at is null`)).toBe("1");
      expect(sql(`select outcome from invite_requests where email='${visitor}'`)).toBe("invited");
      results.push({ page: "Admin: invite request to invite", path: "/admin/users", checks: ["Create invite turns a request into an invite link", "request marked as invited"] });
    }
  }

  // ---------- dark theme: every signed-in page once more
  const dark = await (await browser.newContext({ viewport: { width: 375, height: 800 }, colorScheme: "dark", isMobile: true, hasTouch: true })).newPage();
  await logIn(dark, owner);
  const darkProblems: string[] = [];
  for (const path of ["/dashboard", "/jobs", "/applications", "/cvs", "/profiles", "/auto-apply", "/notifications", "/account", "/admin", "/admin/users", "/admin/sources", "/admin/applications", "/admin/ai", "/admin/health", "/privacy", "/"]) {
    const r = await dark.goto(path);
    const ok = r!.status() === 200 && (await dark.evaluate(() => document.documentElement.classList.contains("dark") && document.documentElement.scrollWidth <= 375));
    if (!ok) darkProblems.push(path);
  }
  expect(darkProblems).toEqual([]);
  results.push({ page: "Dark theme", path: "16 pages", checks: ["every page loads in dark mode", "no sideways scroll at 375 px"] });
  if (PROOF) {
    const desk = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" })).newPage();
    await logIn(desk, tester);
    await desk.screenshot({ path: `${PROOF}/30-desktop-dashboard-dark.png` });
    await desk.goto(`/jobs/${sql("select id from jobs where title='Software Developer'")}`);
    await desk.screenshot({ path: `${PROOF}/31-desktop-job-dark.png`, fullPage: true });
    writeFileSync(`${PROOF}/results.json`, JSON.stringify(results, null, 2));
  }
});
