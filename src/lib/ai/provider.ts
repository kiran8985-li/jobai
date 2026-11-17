import "server-only";
import OpenAI from "openai";
import { env, hasAI } from "../env";

/**
 * The one interface every AI provider sits behind, so DeepSeek can be swapped for a
 * UK/EU-hosted or no-training provider without touching the rest of the app.
 */
export interface AIProvider {
  readonly model: string;
  completeJson(req: { system: string; user: string; maxTokens: number }): Promise<{
    content: string;
    promptTokens: number;
    completionTokens: number;
    /** The model that actually answered (the backup model when the main one was busy). */
    model?: string;
  }>;
}

/** Errors worth trying again or on the backup model: busy, rate-limited, server error, timeout. */
export function isTransient(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  // The SDK's timeout and connection errors carry no status and are named "Error", so look at the class.
  const kind = err instanceof Error ? `${err.name} ${err.constructor.name}` : "";
  return /Timeout|Connection/i.test(kind);
}

/** Seconds to wait before retrying a rate-limited call: the service's Retry-After, capped at 20. */
function retryAfterMs(err: unknown): number {
  const h = (err as { headers?: Headers | Record<string, string> } | null)?.headers;
  const raw = h instanceof Headers ? h.get("retry-after") : h?.["retry-after"];
  const secs = Number(raw);
  return (Number.isFinite(secs) && secs > 0 ? Math.min(secs, 20) : 10) * 1000;
}

/**
 * Tries each model in turn and moves to the next only when the error is transient. A rate-limited
 * call (429) is retried once on the same model after a short wait first.
 */
export async function withModelFallback<T>(
  models: string[],
  call: (model: string) => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ result: T; model: string }> {
  let last: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { result: await call(model), model };
      } catch (err) {
        last = err;
        if (!isTransient(err)) throw err;
        if ((err as { status?: number }).status !== 429 || attempt === 1) break;
        await wait(retryAfterMs(err));
      }
    }
  }
  throw last;
}

/**
 * DeepSeek (or any OpenAI-compatible service) through its endpoint. Model names always come from
 * DEEPSEEK_MODEL and, when the main model is busy, DEEPSEEK_FALLBACK_MODEL.
 */
export function createDeepSeekProvider(): AIProvider | null {
  const e = env();
  if (!hasAI(e)) return null;
  const client = new OpenAI({ apiKey: e.DEEPSEEK_API_KEY, baseURL: e.DEEPSEEK_BASE_URL, maxRetries: 0 });
  const effort = e.AI_REASONING_EFFORT;
  const model = e.DEEPSEEK_MODEL!;
  const models = [model, e.DEEPSEEK_FALLBACK_MODEL].filter((m, i, all): m is string => Boolean(m) && all.indexOf(m) === i);
  return {
    model,
    async completeJson({ system, user, maxTokens }) {
      // Long answers (a whole tailored CV) get more time than short ones.
      const timeout = maxTokens > 4000 ? 180_000 : 90_000;
      const { result: res, model: used } = await withModelFallback(models, (m) => client.chat.completions.create({
        model: m,
        ...(effort ? { reasoning_effort: effort } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }, { timeout }));
      return {
        model: used,
        content: res.choices[0]?.message?.content ?? "",
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      };
    },
  };
}
