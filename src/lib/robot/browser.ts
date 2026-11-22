import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Frame, Page } from "playwright";
import { isSensitiveQuestion } from "../screening";
import { SENSITIVE_LOOSE } from "./answer";
import type { Robot, RobotInput, RobotResult } from "./types";

/**
 * The apply robot, driving a real browser on the server. It fills forms with the same script as the
 * browser add-on (extension/fill.js), which never answers sensitive questions and never submits.
 * Pressing Submit is a separate step here, done only in live mode and only when every required field
 * is filled. It never tries to get past an "are you a robot" check: those jobs go back to the person.
 */

const BLOCKED = /(^|\.)(linkedin\.com|indeed\.com|indeed\.co\.uk)$/i;
const CONFIRMED = /thank(s| you) for (your )?appl|application (has been |was )?(received|submitted|sent)|we('ve| have) received your application|successfully (submitted|applied)/i;
const CHALLENGE = /recaptcha\/(api2|enterprise)\/(anchor|bframe)|hcaptcha\.com|challenges\.cloudflare\.com|turnstile/i;

let fillScript: string | null = null;
const fillJs = () => (fillScript ??= readFileSync(path.join(process.cwd(), "extension", "fill.js"), "utf8"));

type FillReport = { filled: string[]; attached: string | null; sensitive: string[]; unanswered: string[]; blocked: boolean };

/** Frames that hold form fields (application forms are sometimes inside a frame). */
async function formFrames(page: Page): Promise<Frame[]> {
  const out: Frame[] = [];
  for (const f of page.frames()) {
    const n = await f.locator("input:not([type=hidden]), textarea, select").count().catch(() => 0);
    if (n >= 2) out.push(f);
  }
  return out;
}

async function hasForm(page: Page) {
  for (const f of await formFrames(page)) {
    if ((await f.locator("input[type=email], input[type=file], input[name*=email i]").count().catch(() => 0)) > 0) return true;
  }
  return false;
}

/** A visible "are you a robot" box. Invisible checks are left to the employer to decide on. */
async function visibleChallenge(page: Page) {
  for (const el of await page.locator("iframe").all()) {
    const src = (await el.getAttribute("src").catch(() => "")) ?? "";
    if (!CHALLENGE.test(src)) continue;
    const box = await el.boundingBox().catch(() => null);
    const shown = await el.isVisible().catch(() => false);
    if (shown && box && box.width > 60 && box.height > 40 && box.y > -1000) return true;
  }
  return false;
}

async function fillAll(page: Page, data: unknown): Promise<FillReport> {
  const merged: FillReport = { filled: [], attached: null, sensitive: [], unanswered: [], blocked: false };
  for (const f of await formFrames(page)) {
    await f.addScriptTag({ content: fillJs() }).catch(() => {});
    const r = (await f.evaluate((d) => (window as unknown as { __jobpilotFill?: (x: unknown) => unknown }).__jobpilotFill?.(d) ?? null, data).catch(() => null)) as FillReport | null;
    if (!r) continue;
    merged.filled.push(...r.filled);
    merged.sensitive.push(...r.sensitive);
    merged.unanswered.push(...r.unanswered);
    merged.attached ??= r.attached;
    merged.blocked ||= r.blocked;
  }
  return merged;
}

// Runs inside the employer's page. Kept as plain script text: compiled code can carry helper names
// that do not exist in the page, which would make the check fail.
const REQUIRED_MISSING_JS = `(() => {
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const labelOf = (el) => {
    const id = el.getAttribute("id");
    const byFor = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
    const by = el.getAttribute("aria-labelledby");
    const byIds = by ? by.split(/\\s+/).map((i) => (document.getElementById(i) || {}).textContent || "").join(" ") : "";
    const fs = el.closest("fieldset");
    return norm(el.getAttribute("aria-label") || (byFor && byFor.textContent) || byIds || (el.closest("label") && el.closest("label").textContent) || (fs && fs.querySelector("legend") && fs.querySelector("legend").textContent) || el.getAttribute("name"));
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return el.type === "file" || (r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none");
  };
  const required = (el) => el.required || el.getAttribute("aria-required") === "true" || /\\*\\s*$/.test(labelOf(el));
  const empty = (el) => {
    if (el.type === "file") return !el.files || el.files.length === 0;
    if (el.type === "checkbox") return !el.checked;
    if (el.type === "radio") return !document.querySelector('input[type=radio][name="' + CSS.escape(el.name) + '"]:checked');
    if (el.tagName === "SELECT") return el.selectedIndex <= 0 && !el.value;
    if (el.getAttribute("role") === "combobox") {
      // Typed text is not a choice: a search box counts as answered only when an option was picked.
      const box = el.closest('[class*="select__container"], [class*="select-container"]');
      if (box) return !box.querySelector('[class*="single-value"], [class*="multi-value"]');
      return !norm(el.value);
    }
    return !norm(el.value);
  };
  const seen = new Set();
  const list = [];
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select")) {
    if (!el.id && !el.name && !el.getAttribute("aria-label")) continue; // a widget's internal helper input
    if (!shown(el) || !required(el) || !empty(el)) continue;
    const key = el.type === "radio" ? "radio:" + el.name : labelOf(el);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(labelOf(el).replace(/\\s*\\*\\s*$/, "") || "A required field");
  }
  return list;
})()`;

/** Required fields still empty, by their label. A check that cannot run counts as "not safe to submit". */
async function requiredMissing(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const f of await formFrames(page)) {
    const missing = (await f.evaluate(REQUIRED_MISSING_JS).catch(() => ["(the robot could not check this form)"])) as string[];
    out.push(...missing);
  }
  return [...new Set(out)];
}

async function openForm(page: Page) {
  if (await hasForm(page)) return true;
  // Many job pages show the advert first, with an Apply button that reveals or opens the form.
  const apply = page.getByRole("link", { name: /^\s*apply( now| for this (job|role|position))?\s*$/i }).or(page.getByRole("button", { name: /^\s*apply( now| for this (job|role|position))?\s*$/i })).first();
  if (await apply.isVisible().catch(() => false)) {
    await apply.click().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2500);
  }
  return hasForm(page);
}

async function pressSubmit(page: Page) {
  // The filler's notice banner is for people; it would sit on top of the Submit button.
  for (const f of page.frames()) await f.evaluate(() => document.getElementById("jobpilot-banner")?.remove()).catch(() => {});
  for (const f of await formFrames(page)) {
    const btn = f.locator("button[type=submit], input[type=submit], button").filter({ hasText: /submit|send application|apply/i }).first();
    const alt = f.locator("input[type=submit]").first();
    const target = (await btn.isVisible().catch(() => false)) ? btn : (await alt.isVisible().catch(() => false)) ? alt : null;
    if (target) {
      await target.scrollIntoViewIfNeeded().catch(() => {});
      return target.click({ timeout: 15_000 }).then(() => true, () => false);
    }
  }
  return false;
}

async function confirmed(page: Page) {
  for (const f of page.frames()) {
    const text = await f.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    if (CONFIRMED.test(text)) return true;
  }
  return /confirmation|thank/i.test(page.url());
}

export function createBrowserRobot(opts: { proxy?: string; headless?: boolean } = {}): Robot {
  return async (input: RobotInput): Promise<RobotResult> => {
    const { chromium } = await import("playwright");
    const base: Omit<RobotResult, "outcome"> = { filled: [], aiAnswered: [], unanswered: [] };
    const browser = await chromium.launch({ headless: opts.headless ?? true, ...(opts.proxy ? { proxy: { server: opts.proxy, bypass: "localhost,127.0.0.1" } } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const host = new URL(input.url).hostname;
      if (BLOCKED.test(host)) return { ...base, outcome: "needs_user", reason: "JobPilot never applies on LinkedIn or Indeed." };
      await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      if (BLOCKED.test(new URL(page.url()).hostname)) return { ...base, outcome: "needs_user", reason: "This job sends you to LinkedIn or Indeed, where JobPilot never applies." };
      if (!(await openForm(page))) return { ...base, outcome: "needs_user", reason: "The robot could not find the application form on the employer's page." };
      if (await visibleChallenge(page)) return { ...base, outcome: "needs_user", reason: "The employer's form has an 'are you a robot' check, so you need to submit it yourself." };
      // Test mode: once the form is open, nothing more may reach the employer (some forms upload the CV
      // as soon as it is attached, before Submit).
      if (input.mode !== "live") await page.context().route("**/*", (r) => r.abort()).catch(() => {});

      const data = { ...input.data, cv: { filename: input.cv.filename, base64: Buffer.from(input.cv.bytes).toString("base64") } };
      let report = await fillAll(page, data);

      // Questions no saved answer covers: ask the answerer (CV facts only), never for sensitive ones.
      const aiAnswered: RobotResult["aiAnswered"] = [];
      if (input.answer) {
        for (const q of report.unanswered.slice(0, 12)) {
          if (isSensitiveQuestion(q) || SENSITIVE_LOOSE.test(q) || /^(attach|upload|file upload)$|cover letter|\bfile\b/i.test(q)) continue;
          const a = await input.answer(q).catch(() => null);
          if (a && a.trim()) aiAnswered.push({ question: q, answer: a.trim().slice(0, 1500) });
        }
        if (aiAnswered.length) {
          const more = { ...data, answers: [...input.data.answers, ...aiAnswered.map((x) => ({ key: "custom", question: x.question, answer: x.answer }))] };
          const again = await fillAll(page, more);
          report = { ...again, filled: [...new Set([...report.filled, ...again.filled])] };
        }
      }
      const missing = await requiredMissing(page);
      const result = { filled: report.filled, aiAnswered, unanswered: missing };
      if (!report.attached) return { ...result, outcome: "needs_user", reason: "The robot could not attach your CV on this form.", screenshot: await page.screenshot({ fullPage: true }) };
      if (missing.length) {
        return { ...result, outcome: "needs_user", reason: `It needs your answer to: ${missing.slice(0, 3).join("; ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}.`, screenshot: await page.screenshot({ fullPage: true }) };
      }
      if (input.mode !== "live") return { ...result, outcome: "ready", screenshot: await page.screenshot({ fullPage: true }) };

      if (!(await pressSubmit(page))) return { ...result, outcome: "needs_user", reason: "The robot could not find the Submit button.", screenshot: await page.screenshot({ fullPage: true }) };
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      if (await visibleChallenge(page)) return { ...result, outcome: "needs_user", reason: "The employer asked an 'are you a robot' check after Submit; please submit it yourself.", screenshot: await page.screenshot({ fullPage: true }) };
      const ok = await confirmed(page);
      const shot = await page.screenshot({ fullPage: true });
      return ok
        ? { ...result, outcome: "submitted", screenshot: shot }
        : { ...result, outcome: "needs_user", reason: "Submit was pressed but the employer's page did not confirm it. Check your email, or apply yourself.", screenshot: shot };
    } finally {
      await browser.close().catch(() => {});
    }
  };
}
