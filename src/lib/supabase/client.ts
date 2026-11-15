"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "../env-public";

/** Supabase client for client components. Uses only the public anon key; RLS protects the data. */
export function createSupabaseBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = publicEnv();
  if (!url || !key) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createBrowserClient(url, key);
}
