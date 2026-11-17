import "server-only";
import { z } from "zod";
import { publicEnvSchema } from "./env-public";

/**
 * Server-side settings. Secrets live here and must never be imported by client code
 * ("server-only" makes the build fail if a client component imports this file).
 *
 * Most values are optional so the app runs with no keys (demo source + offline fallbacks).
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const intWithDefault = (def: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === "") return def;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) {
        ctx.addIssue({ code: "custom", message: `must be a whole number, got "${v}"` });
        return z.NEVER;
      }
      return n;
    });

const boolWithDefault = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === "") return def;
      const s = v.trim().toLowerCase();
      if (["true", "1", "yes"].includes(s)) return true;
      if (["false", "0", "no"].includes(s)) return false;
      ctx.addIssue({ code: "custom", message: `must be true or false, got "${v}"` });
      return z.NEVER;
    });

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: optional,

  DEEPSEEK_API_KEY: optional,
  DEEPSEEK_MODEL: optional,
  DEEPSEEK_FALLBACK_MODEL: optional,
  /** Optional "none" | "low" | "medium" | "high" for thinking models (Gemini, o-series). Empty = provider default. */
  AI_REASONING_EFFORT: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined))
    .pipe(z.enum(["none", "minimal", "low", "medium", "high"]).optional()),
  DEEPSEEK_BASE_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : "https://api.deepseek.com"))
    .pipe(z.url({ message: "must be a full URL such as https://api.deepseek.com" })),
  AI_DAILY_LIMIT_PER_USER: intWithDefault(200),
  AI_PRICE_INPUT_PER_MTOK: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? Number(v) : 0.3))
    .pipe(z.number({ message: "must be a number, e.g. 0.30" }).min(0).max(1000)),
  AI_PRICE_OUTPUT_PER_MTOK: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? Number(v) : 1.2))
    .pipe(z.number({ message: "must be a number, e.g. 1.20" }).min(0).max(1000)),

  ADZUNA_APP_ID: optional,
  ADZUNA_APP_KEY: optional,
  REED_API_KEY: optional,
  GREENHOUSE_BOARDS: optional,
  LEVER_COMPANIES: optional,
  DEMO_SOURCE: boolWithDefault(true),

  APPLY_MODE: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : "dry_run"))
    .pipe(z.enum(["dry_run", "live"], { message: 'must be "dry_run" or "live"' })),
  RESEND_API_KEY: optional,
  MAIL_FROM: optional,
  DEFAULT_MIN_MATCH: intWithDefault(75).pipe(z.number().max(100, "must be 0–100")),
  DEFAULT_DAILY_LIMIT: intWithDefault(10),

  CRON_SECRET: optional,
  SCAN_INTERVAL_MIN: intWithDefault(15),
  API_SOURCES_MIN_INTERVAL_MIN: intWithDefault(60),

  SIGNUP_MODE: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : "invite"))
    .pipe(z.enum(["invite", "open"], { message: 'must be "invite" or "open"' })),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {}

/** Parse an env object. Throws EnvError with one readable line per problem. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new EnvError(
      `Invalid settings in .env.local (see .env.example for the template):\n${lines.join("\n")}`,
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Validated server settings, read once per process. */
export function env(): ServerEnv {
  if (!cached) cached = parseServerEnv(process.env);
  return cached;
}

/** True when Supabase is configured well enough to talk to it. */
export function hasSupabase(e: ServerEnv = env()): boolean {
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** True when the DeepSeek client can be used (otherwise use the non-AI fallback). */
export function hasAI(e: ServerEnv = env()): boolean {
  return Boolean(e.DEEPSEEK_API_KEY && e.DEEPSEEK_MODEL);
}
