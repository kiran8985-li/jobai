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
  }>;
}

/** DeepSeek through its OpenAI-compatible endpoint. The model name always comes from DEEPSEEK_MODEL. */
export function createDeepSeekProvider(): AIProvider | null {
  const e = env();
  if (!hasAI(e)) return null;
  const client = new OpenAI({ apiKey: e.DEEPSEEK_API_KEY, baseURL: e.DEEPSEEK_BASE_URL, timeout: 60_000, maxRetries: 1 });
  const model = e.DEEPSEEK_MODEL!;
  return {
    model,
    async completeJson({ system, user, maxTokens }) {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      });
      return {
        content: res.choices[0]?.message?.content ?? "",
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      };
    },
  };
}
