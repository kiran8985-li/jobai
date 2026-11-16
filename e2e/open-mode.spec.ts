import { expect, test } from "@playwright/test";
import { PASSWORD, assertLocal, sql, verificationLink } from "./helpers";

/**
 * SIGNUP_MODE=open makes registration public with no other change. Runs only when the app was
 * started with SIGNUP_MODE=open (see README.md, "Tests").
 */
test.skip(process.env.SIGNUP_MODE !== "open", "Start the app with SIGNUP_MODE=open to run this test");

test("open mode: anyone can register without an invite", async ({ page }) => {
  assertLocal();
  const PROOF = process.env.PROOF_DIR;
  await page.goto("/");
  await expect(page.getByText("Now open to everyone")).toBeVisible();
  await expect(page.locator("#request")).toHaveCount(0);
  if (PROOF) await page.screenshot({ path: `${PROOF}/40-open-landing.png`, fullPage: true });
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  if (PROOF) await page.screenshot({ path: `${PROOF}/41-open-signup.png`, fullPage: true });

  const email = `open${String(Date.now()).slice(-6)}@example.com`;
  expect(sql(`select count(*) from invites where email='${email}'`)).toBe("0");
  await page.fill('input[name="name"]', "Owen Open");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('main button[type="submit"]');
  await page.waitForURL("**/verify-email**");
  await page.goto(await verificationLink(email));
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Welcome, Owen" })).toBeVisible();
  expect(sql(`select is_admin from profiles_user p join auth.users u on u.id=p.id where u.email='${email}'`)).toBe("f");
  expect(sql("select value from app_settings where key='signup_mode'")).toBe("open");
});
