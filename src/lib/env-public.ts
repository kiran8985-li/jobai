import { z } from "zod";

/**
 * Settings that are safe in the browser (NEXT_PUBLIC_*). Nothing secret may be added here.
 * Next.js inlines these at build time, so they must be read as literal process.env.NAME.
 */
const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined))
  .pipe(z.url({ message: "must be a full URL, e.g. https://xyz.supabase.co" }).optional());

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined)),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : "http://localhost:3000"))
    .pipe(z.url({ message: "must be a full URL, e.g. http://localhost:3000" })),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function publicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}
