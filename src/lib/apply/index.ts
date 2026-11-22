import "server-only";
import { env } from "../env";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createResendSender } from "./resend";
import { runApply, type ApplyResult } from "./run";
import { supabaseApplyStore } from "./supabase-store";
import { createBrowserRobot } from "../robot/browser";
import { makeAnswerer } from "../robot/answer";

/**
 * Email sending is switched OFF for now, on purpose: every application is prepared and stored, and
 * nothing is sent, whatever APPLY_MODE says. To switch sending on later, set this to true and follow
 * "Before going live" in docs/applying.md. The sending code itself is built and tested.
 */
export const EMAIL_SENDING_ENABLED = false;

/** The mode that really applies: "dry_run" unless sending is switched on AND APPLY_MODE is "live". */
export function effectiveApplyMode(configured: "dry_run" | "live"): "dry_run" | "live" {
  return EMAIL_SENDING_ENABLED ? configured : "dry_run";
}

/**
 * The apply stage as the app runs it. APPLY_MODE decides whether anything can be sent:
 * "dry_run" (the default) prepares and stores everything and sends nothing.
 */
export async function runConfiguredApply(opts: { userId?: string } = {}): Promise<ApplyResult | null> {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return null;
  return runApply({
    store: supabaseApplyStore(createSupabaseAdminClient()),
    mode: effectiveApplyMode(e.APPLY_MODE),
    mailFrom: e.MAIL_FROM,
    sender: createResendSender(e.RESEND_API_KEY),
    userId: opts.userId,
    robot: e.ROBOT_ENABLED ? createBrowserRobot({ proxy: process.env.HTTPS_PROXY || undefined }) : null,
    robotMode: e.ROBOT_MODE,
    answererFor: (userId, cv, saved) => makeAnswerer(userId, cv, saved),
  });
}
