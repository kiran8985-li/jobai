import "server-only";
import { scrubContact } from "../cv/redact";
import { env } from "../env";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createDeepSeekProvider, type AIProvider } from "./provider";

/** No key, daily limit reached, or the call failed. Every caller must catch this and use its non-AI fallback. */
export class AIUnavailable extends Error {}

export type UsageStore = {
  countToday(userId: string | null): Promise<number>;
  /** False when the user has not given, or has withdrawn, consent to AI processing. */
  hasConsent?(userId: string): Promise<boolean>;
  log(entry: {
    userId: string | null;
    purpose: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    ok: boolean;
  }): Promise<void>;
};

export type AIDeps = { provider: AIProvider | null; usage: UsageStore | null; dailyLimit: number };

/** Usage is recorded in ai_usage with the service role (users cannot read or forge it). */
function supabaseUsageStore(): UsageStore | null {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return null;
  const db = createSupabaseAdminClient();
  return {
    async hasConsent(userId) {
      const { data, error } = await db.from("profiles_user").select("ai_consent_at").eq("id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data?.ai_consent_at);
    },
    async countToday(userId) {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      let q = db.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString());
      q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async log(entry) {
      await db.from("ai_usage").insert({
        user_id: entry.userId,
        purpose: entry.purpose,
        model: entry.model,
        prompt_tokens: entry.promptTokens,
        completion_tokens: entry.completionTokens,
        ok: entry.ok,
      });
    },
  };
}

export function defaultAIDeps(): AIDeps {
  return { provider: createDeepSeekProvider(), usage: supabaseUsageStore(), dailyLimit: env().AI_DAILY_LIMIT_PER_USER };
}

/** Pulls a JSON object out of a model reply, tolerating code fences and chatter. */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("no JSON in reply");
  }
}

/**
 * The only way the app talks to an AI. Enforces the per-user daily limit, logs usage
 * (never content), and scrubs emails and phone numbers from everything sent.
 * Throws AIUnavailable on any problem.
 */
export async function chatJson(
  req: { system: string; user: string; purpose: string; userId: string | null; maxTokens?: number },
  deps: AIDeps = defaultAIDeps(),
): Promise<unknown> {
  const { provider, usage, dailyLimit } = deps;
  if (!provider) throw new AIUnavailable("AI is not configured");
  // Without the usage log the daily limit cannot be enforced, so the AI stays off.
  if (!usage) throw new AIUnavailable("AI usage log is not available");

  // UK GDPR: nothing about a person goes to the AI unless they have consented, and consent can be withdrawn.
  if (req.userId && usage.hasConsent) {
    let ok = false;
    try {
      ok = await usage.hasConsent(req.userId);
    } catch {
      throw new AIUnavailable("could not check AI consent");
    }
    if (!ok) throw new AIUnavailable("no AI consent");
  }

  let used: number;
  try {
    used = await usage.countToday(req.userId);
  } catch {
    throw new AIUnavailable("could not check the daily AI limit");
  }
  if (used >= dailyLimit) throw new AIUnavailable("daily AI limit reached");

  const base = { userId: req.userId, purpose: req.purpose, model: provider.model };
  try {
    const res = await provider.completeJson({
      system: scrubContact(req.system),
      user: scrubContact(req.user),
      maxTokens: req.maxTokens ?? 3000,
    });
    const parsed = extractJson(res.content);
    await usage.log({ ...base, promptTokens: res.promptTokens, completionTokens: res.completionTokens, ok: true });
    return parsed;
  } catch (err) {
    await usage.log({ ...base, promptTokens: 0, completionTokens: 0, ok: false }).catch(() => {});
    // Only the error type is kept; a provider error message could echo the prompt.
    throw new AIUnavailable(`AI call failed: ${err instanceof Error ? err.name : "error"}`);
  }
}
