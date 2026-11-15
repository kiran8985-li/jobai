import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Supabase client for server components, route handlers and server actions, acting as the
 * signed-in user (anon key + the user's session cookie), so Row Level Security applies.
 */
export async function createSupabaseServerClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = env();
  if (!url || !key) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component, where cookies are read-only. Middleware refreshes the session.
        }
      },
    },
  });
}
