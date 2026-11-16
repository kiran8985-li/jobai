import { expect, test } from "@playwright/test";
import { PASSWORD, assertLocal, makeUser, resetDatabase, sql, verificationLink } from "./helpers";

/**
 * The whole journey a tester makes, through the real pages:
 * invite → sign-up → verify email → upload CV → approve → create a search → run a scan →
 * see matches → see a prepared application. Then the privacy controls: export and delete.
 */
test("invite to prepared application, then export and delete", async ({ page, browser }) => {
  assertLocal();
  await resetDatabase();
  const run = String(Date.now()).slice(-6);
  await makeUser(`owner${run}@example.com`, "Olivia Owner"); // first account = admin
  const email = `tester${run}@example.com`;

  // The admin creates an invite link.
  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/login");
  await admin.fill('input[name="email"]', `owner${run}@example.com`);
  await admin.fill('input[name="password"]', PASSWORD);
  await admin.click('main button[type="submit"]');
  await admin.waitForURL("**/dashboard");
  await admin.goto("/admin/users");
  await admin.fill('input[name="email"]', email);
  await admin.getByRole("button", { name: "Create invite link" }).click();
  const link = (await admin.locator(`[data-invite="${email}"] [data-invite-link]`).textContent())!;
  expect(link).toContain("/signup?token=");

  // Sign up with the invite, then verify the email.
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.locator('input[name="email"]')).toHaveValue(email);
  await page.fill('input[name="name"]', "Tess Tester");
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/verify-email**");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/); // not usable before verifying
  await page.goto(await verificationLink(email));
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Welcome, Tess" })).toBeVisible();

  // Consent, upload the CV, approve it.
  await page.getByRole("link", { name: "Get started" }).click();
  await page.check('input[name="consent"]');
  await page.click('main button[type="submit"]');
  await page.setInputFiles('input[type="file"]', "reference/sample_cv.txt");
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/review");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Priya Shah");
  await page.getByRole("button", { name: "Approve as my master CV" }).click();

  // Create a search.
  await page.waitForURL("**/onboarding/preferences");
  await page.fill('main input[name="name"]', "Python jobs");
  await page.fill('main input[name="roles"]', "Python Developer, Software Developer");
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/auto-apply?welcome=1");

  // Run a scan from the dashboard.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Run scan now" }).click();
  await page.waitForURL("**scan=done**", { timeout: 150_000 });
  await expect(page.getByText(/Scan finished: 12 new jobs/)).toBeVisible();

  // See matches. (How many depends on whether an AI eligibility check ran, so read it from the database.)
  const matchCount = Number(sql("select count(distinct m.job_id) from matches m join search_profiles s on s.id=m.search_profile_id where m.filtered_reason is null and m.score >= s.min_match"));
  expect(matchCount).toBeGreaterThanOrEqual(2);
  await page.goto("/jobs");
  const cards = page.locator("main li h2");
  await expect(cards).toHaveCount(matchCount);
  await expect(cards.first()).toContainText(/Python Developer|Software Developer/);
  await expect(page.locator('main li [aria-label^="Match score"]').first()).toHaveText("100");

  // See a prepared application, waiting for the user (auto-apply was left off).
  await page.goto("/applications");
  await expect(page.locator("[data-application]")).toHaveCount(matchCount);
  await page.locator('[data-application="Python Developer"]').click();
  await expect(page.getByText("Waiting for you").first()).toBeVisible();
  await expect(page.getByText("The prepared email")).toBeVisible();
  await expect(page.getByText("careers@fernhill.example.com")).toBeVisible();
  await expect(page.getByText("The CV for this application")).toBeVisible();
  const pdf = await page.request.get(`/api/cvs/tailored/${sql("select id from jobs where title='Python Developer'")}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Export my data: everything about this user, nothing about anyone else.
  await page.goto("/account");
  const exp = await page.request.get("/api/account/export");
  expect(exp.status()).toBe(200);
  expect(exp.headers()["content-disposition"]).toMatch(/attachment; filename="jobpilot-ai-my-data-/);
  const data = await exp.json();
  expect(data.account.email).toBe(email);
  expect(data.cvs[0].raw_text).toContain("Northwind Digital Ltd");
  expect(data.job_searches).toHaveLength(1);
  expect(data.applications).toHaveLength(matchCount);
  expect(JSON.stringify(data)).not.toContain(`owner${run}@example.com`);

  // Delete my account: everything goes, including stored files.
  const userId = sql(`select id from auth.users where email='${email}'`);
  expect(Number(sql(`select count(*) from storage.objects where name like '${userId}/%'`))).toBeGreaterThan(0);
  await page.fill('input[name="confirm"]', "wrong@example.com");
  await page.getByRole("button", { name: "Delete my account and data" }).click();
  await expect(page.getByText("Type your email address exactly as shown")).toBeVisible();
  await page.fill('input[name="confirm"]', email);
  await page.getByRole("button", { name: "Delete my account and data" }).click();
  await page.waitForURL("**/?deleted=1");
  await expect(page.getByText("Your account and data have been deleted")).toBeVisible();
  for (const table of ["profiles_user", "cvs", "search_profiles", "matches", "tailored_cvs", "applications", "notifications"]) {
    const col = table === "profiles_user" ? "id" : "user_id";
    expect(sql(`select count(*) from ${table} where ${col}='${userId}'`), table).toBe("0");
  }
  expect(sql(`select count(*) from auth.users where id='${userId}'`)).toBe("0");
  expect(sql(`select count(*) from storage.objects where name like '${userId}/%'`)).toBe("0");
  expect(sql(`select count(*) from invites where email='${email}'`)).toBe("0");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("privacy page, consent withdrawal, and the last admin cannot delete themselves", async ({ page }) => {
  assertLocal();
  await page.goto("/privacy");
  for (const text of ["What we store, and why", "DeepSeek", "servers in China", "Supabase", "How long we keep it", "Download my data", "ico.org.uk"]) {
    await expect(page.getByText(text).first()).toBeVisible();
  }
  const run = String(Date.now()).slice(-6);
  await resetDatabase();
  await makeUser(`solo${run}@example.com`, "Solo Admin");
  const userId = await makeUser(`u${run}@example.com`, "Una User");
  sql(`update profiles_user set ai_consent_at = now() where id='${userId}'`);
  sql(`insert into search_profiles (user_id, name, roles, consent_at, auto_apply) values ('${userId}', 'S', '{Dev}', now(), true)`);

  await page.goto("/login");
  await page.fill('input[name="email"]', `u${run}@example.com`);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/dashboard");
  await page.goto("/account");
  await page.getByRole("button", { name: "Withdraw AI consent" }).click();
  await page.waitForURL("**msg=withdrawn");
  expect(sql(`select ai_consent_at is null from profiles_user where id='${userId}'`)).toBe("t");
  expect(sql(`select auto_apply::text || (consent_at is null)::text from search_profiles where user_id='${userId}'`)).toBe("falsetrue");

  // The only admin is not allowed to delete their account (it would leave nobody to run the beta).
  await page.goto("/auth/signout", { waitUntil: "commit" }).catch(() => {});
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', `solo${run}@example.com`);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/dashboard");
  await page.goto("/account");
  await page.fill('input[name="confirm"]', `solo${run}@example.com`);
  await page.getByRole("button", { name: "Delete my account and data" }).click();
  await expect(page.getByText("You are the only admin")).toBeVisible();
  expect(sql(`select count(*) from auth.users where email='solo${run}@example.com'`)).toBe("1");
});
