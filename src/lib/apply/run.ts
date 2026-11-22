import type { Robot, RobotMode } from "../robot/types";
import type { CvProfile } from "../cv/types";
import { buildFillData } from "../fill-data";
import { cvFilename } from "../render/layout";
import { isAutoApplyOn } from "../search-profiles";
import { buildApplicationEmail, isReservedAddress, type ApplicationEmail } from "./email";
import { checkQuestions } from "./questions";
import type { ApplyStore } from "./store";

/** Sends one email. Must throw on failure. `idempotencyKey` lets the provider ignore a repeat. */
export type Sender = (email: ApplicationEmail & { from: string }, attachment: Uint8Array, idempotencyKey: string) => Promise<{ id: string }>;

export type ApplyOptions = {
  store: ApplyStore;
  mode: "dry_run" | "live";
  mailFrom?: string;
  sender?: Sender | null;
  now?: () => number;
  userId?: string;
  /** The apply robot for jobs applied for on the employer's own site. Absent = those jobs wait for the person. */
  robot?: Robot | null;
  /** "live" lets the robot press Submit; anything else stops before Submit. */
  robotMode?: RobotMode;
  /** Makes the robot's question answerer for one person (AI from CV facts only). */
  answererFor?: (userId: string, cv: CvProfile, saved: Record<string, string>) => ((question: string) => Promise<string | null>) | undefined;
};
export type ApplyResult = { refused: string | null; dryRun: number; sent: number; failed: number; skipped: number; manual: number };

/** Midnight at the start of today in UK time, as an ISO instant. Daily limits reset then. */
export function ukDayStart(now: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(now));
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  // Some systems print midnight as hour 24.
  return new Date(Math.floor(now / 1000) * 1000 - ((n("hour") % 24) * 3600 + n("minute") * 60 + n("second")) * 1000).toISOString();
}

/**
 * The apply stage. For every match that has a tailored CV and no application yet:
 *  - a job that takes email applications, on a search with consent and auto-apply on → apply
 *    automatically (in dry run: prepare and store everything, send nothing);
 *  - every other job → a prepared application waiting for the user (Manual Apply);
 *  - a job with a sensitive or unanswered question is never sent automatically: it is skipped and
 *    the user is told why.
 * One application per user per job (enforced by the database), so re-running can never apply twice.
 * In live mode the application is recorded BEFORE sending and then marked sent or failed, so a
 * crash mid-send leaves a visible "prepared" row instead of a second email.
 */
export async function runApply(opts: ApplyOptions): Promise<ApplyResult> {
  const { store, mode } = opts;
  const now = opts.now ?? Date.now;
  const out: ApplyResult = { refused: null, dryRun: 0, sent: 0, failed: 0, skipped: 0, manual: 0 };

  // Live sending needs a configured sender address and mail service. Without them nothing is applied for.
  let emailMode = mode;
  if (mode === "live" && (!opts.mailFrom || !opts.sender)) {
    out.refused = "Live mode is on but MAIL_FROM or the mail service is not set up, so nothing was applied for by email.";
    // Without the robot there is nothing else to do; with it, employer-site applications still go ahead.
    if (!opts.robot) return out;
    emailMode = "dry_run";
  }
  const dayStart = ukDayStart(now());
  const link = (jobId: string) => `/jobs/${jobId}#apply`;

  for (const user of await store.listUsers(opts.userId)) {
    const profiles = new Map(user.profiles.map((p) => [p.id, p]));
    const usedToday = new Map<string, number>();

    for (const c of user.candidates) {
      const profile = profiles.get(c.profileId);
      if (!profile || !profile.is_active || c.score < profile.min_match) continue;
      const base = { user_id: user.userId, job_id: c.job.id, search_profile_id: profile.id };
      const where = `${c.job.title}${c.job.company ? ` at ${c.job.company}` : ""}`;
      const questions = checkQuestions(c.job.questions, user.answers);
      const email = c.job.apply_email ? buildApplicationEmail(c.tailored.content, c.job, questions.answers) : null;
      const common = { answers: questions.answers, apply_url: c.job.apply_url, score: c.score };

      // Employer-site applications go to the robot when auto-apply is on for this search.
      if (opts.robot && c.job.apply_method !== "email" && /^https?:\/\//i.test(c.job.apply_url ?? "") && isAutoApplyOn(profile, user.paused)) {
        if (questions.ok === false && questions.kind === "sensitive") {
          const id = await store.insertApplication({ ...base, status: "skipped", method: c.job.apply_method, detail: { ...common, skip_kind: "sensitive", skip_reason: questions.reason, unanswered: questions.questions } });
          if (id) {
            out.skipped++;
            await store.addNotification({ user_id: user.userId, kind: "application_skipped", message: `Not applied for ${where}. ${questions.reason}`, link: link(c.job.id) });
          }
          continue;
        }
        if (!usedToday.has(profile.id)) usedToday.set(profile.id, await store.countAutoSince(profile.id, dayStart));
        if (usedToday.get(profile.id)! >= profile.daily_limit) continue;
        const robotMode: RobotMode = opts.robotMode === "live" ? "live" : "dry_run";
        const id = await store.insertApplication({ ...base, status: "prepared", method: c.job.apply_method, detail: { ...common, robot: true, mode: robotMode } });
        if (!id) continue;
        usedToday.set(profile.id, usedToday.get(profile.id)! + 1);
        const handBack = async (why: string, extra: Record<string, unknown> = {}) => {
          await store.updateApplication(id, { status: "manual", detail: { ...common, robot: true, mode: robotMode, why, ...extra } });
          out.manual++;
          await store.addNotification({ user_id: user.userId, kind: "application_manual", message: `Ready for you to finish: ${where}. ${why}`, link: link(c.job.id) });
        };
        try {
          const pdf = c.tailored.pdf_path ? await store.readTailoredPdf(c.tailored.pdf_path) : null;
          if (!pdf) { await handBack("Your tailored CV file is missing."); continue; }
          const res = await opts.robot({
            url: c.job.apply_url,
            data: buildFillData(c.tailored.content, user.answers, user.links ?? { linkedin: "", github: "", website: "" }),
            cv: { filename: cvFilename(c.tailored.content, "pdf", c.job.company), bytes: pdf },
            mode: robotMode,
            answer: opts.answererFor?.(user.userId, c.tailored.content, user.answers),
          });
          const shot = res.screenshot && store.saveScreenshot ? await store.saveScreenshot(user.userId, id, res.screenshot).catch(() => null) : null;
          const extra = { filled: res.filled, ai_answers: res.aiAnswered, unanswered: res.unanswered, screenshot_path: shot };
          if (res.outcome === "submitted") {
            await store.updateApplication(id, { status: "sent", sent_at: new Date(now()).toISOString(), detail: { ...common, robot: true, mode: robotMode, ...extra } });
            out.sent++;
            await store.addNotification({ user_id: user.userId, kind: "application_sent", message: `Applied for ${where} on the employer's site.`, link: link(c.job.id) });
          } else if (res.outcome === "ready") {
            await store.updateApplication(id, { status: "dry_run", detail: { ...common, robot: true, mode: robotMode, note: "Test mode: the form was filled and stopped before Submit.", ...extra } });
            out.dryRun++;
            await store.addNotification({ user_id: user.userId, kind: "application_dry_run", message: `Form filled (test mode, not submitted): ${where}.`, link: link(c.job.id) });
          } else {
            await handBack(res.reason ?? "The form needs something only you can provide.", extra);
          }
        } catch (err) {
          await handBack(`The robot could not finish (${err instanceof Error ? err.message.slice(0, 100) : "error"}).`);
        }
        continue;
      }

      // Consent on this search + auto-apply on + not paused, and the job accepts email applications.
      const auto = c.job.apply_method === "email" && email !== null && isAutoApplyOn(profile, user.paused);

      if (!auto) {
        // While everything is paused, jobs that would be sent automatically simply wait.
        if (user.paused && c.job.apply_method === "email" && profile.auto_apply && profile.consent_at) continue;
        const id = await store.insertApplication({
          ...base, status: "manual", method: c.job.apply_method,
          detail: { ...common, email, unanswered: questions.ok ? [] : questions.questions, why: c.job.apply_method === "email" ? "Auto-apply is off for this search." : "This employer takes applications on its own site." },
        });
        if (id) {
          out.manual++;
          await store.addNotification({ user_id: user.userId, kind: "application_manual", message: `Ready for you to apply: ${where}. Your CV is prepared.`, link: link(c.job.id) });
        }
        continue;
      }

      if (!questions.ok) {
        const id = await store.insertApplication({ ...base, status: "skipped", method: "email", detail: { ...common, email, skip_kind: questions.kind, skip_reason: questions.reason, unanswered: questions.questions } });
        if (id) {
          out.skipped++;
          await store.addNotification({ user_id: user.userId, kind: "application_skipped", message: `Not applied for ${where}. ${questions.reason}`, link: link(c.job.id) });
        }
        continue;
      }

      // Daily limit for this search. Jobs left over wait for tomorrow.
      if (!usedToday.has(profile.id)) usedToday.set(profile.id, await store.countAutoSince(profile.id, dayStart));
      if (usedToday.get(profile.id)! >= profile.daily_limit) continue;

      // Demo jobs use reserved test addresses: they are prepared but can never be sent.
      const sendable = emailMode === "live" && !isReservedAddress(email.to);
      if (!sendable) {
        const id = await store.insertApplication({
          ...base, status: "dry_run", method: "email",
          detail: { ...common, email, mode: emailMode, note: emailMode === "live" ? "This is a demo job with a test address, so nothing was sent." : "Test mode: prepared, nothing was sent." },
        });
        if (id) {
          out.dryRun++;
          usedToday.set(profile.id, usedToday.get(profile.id)! + 1);
          await store.addNotification({ user_id: user.userId, kind: "application_dry_run", message: `Prepared (test mode, not sent): ${where}.`, link: link(c.job.id) });
        }
        continue;
      }

      // Live: record first, then send. A second run finds the row and does nothing.
      const id = await store.insertApplication({ ...base, status: "prepared", method: "email", detail: { ...common, email, mode } });
      if (!id) continue;
      usedToday.set(profile.id, usedToday.get(profile.id)! + 1);
      try {
        const pdf = c.tailored.pdf_path ? await store.readTailoredPdf(c.tailored.pdf_path) : null;
        if (!pdf) throw new Error("CV file missing");
        const res = await opts.sender!({ ...email, from: opts.mailFrom! }, pdf, `jobpilot-application-${id}`);
        await store.updateApplication(id, { status: "sent", sent_at: new Date(now()).toISOString(), detail: { ...common, email, mode, provider_id: res.id } });
        out.sent++;
        await store.addNotification({ user_id: user.userId, kind: "application_sent", message: `Applied for ${where}. Replies will go to your own email.`, link: link(c.job.id) });
      } catch (err) {
        // The reason is kept short and never includes the email body or CV.
        const error = err instanceof Error ? err.message.slice(0, 120) : "Sending failed";
        await store.updateApplication(id, { status: "failed", detail: { ...common, email, mode, error } });
        out.failed++;
        await store.addNotification({ user_id: user.userId, kind: "application_failed", message: `Could not send your application for ${where}. You can apply yourself; your CV is prepared.`, link: link(c.job.id) });
      }
    }
  }
  return out;
}
