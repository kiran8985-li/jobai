import "server-only";
import { defaultAIDeps } from "../ai";
import { env, hasAI } from "../env";
import { createSupabaseAdminClient } from "../supabase/admin";
import { runMatching, type MatchingResult } from "./run";
import { supabaseMatchStore } from "./supabase-store";

/**
 * Matching as the app runs it. `ai: false` gives instant keyword scores (used right after a user
 * saves a search or approves a CV); the scheduled scan passes `ai: true` to add the eligibility check.
 */
export async function runConfiguredMatching(opts: { userId?: string; ai: boolean }): Promise<MatchingResult | null> {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return null;
  return runMatching({
    store: supabaseMatchStore(createSupabaseAdminClient()),
    userId: opts.userId,
    ai: opts.ai && hasAI(e) ? defaultAIDeps() : null,
  });
}

/** Scores jobs for one user now, without AI. Never throws: a failure just means the next scan does it. */
export async function matchNowFor(userId: string): Promise<void> {
  try {
    await runConfiguredMatching({ userId, ai: false });
  } catch (err) {
    console.error("Instant matching failed:", err instanceof Error ? err.name : "error");
  }
}
