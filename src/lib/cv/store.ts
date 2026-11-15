import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProfile, type CvProfile } from "./types";

export type CvRow = {
  id: string;
  filename: string;
  approved: boolean;
  parsed_by: "ai" | "heuristic" | null;
  flags: string[];
  created_at: string;
  updated_at: string;
};

/**
 * The user's master CV. THE way later phases (matching, tailoring, applying) get a CV:
 * it only ever returns an approved one, so an unapproved CV can never be used.
 */
export async function getMasterCv(
  db: SupabaseClient,
  userId: string,
): Promise<{ id: string; profile: CvProfile; rawText: string } | null> {
  const { data } = await db
    .from("cvs")
    .select("id, profile_json, raw_text")
    .eq("user_id", userId)
    .eq("approved", true)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, profile: normalizeProfile(data.profile_json), rawText: data.raw_text ?? "" };
}

export async function hasAiConsent(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from("profiles_user").select("ai_consent_at").eq("id", userId).maybeSingle();
  return Boolean(data?.ai_consent_at);
}

export async function listCvs(db: SupabaseClient, userId: string): Promise<CvRow[]> {
  const { data } = await db
    .from("cvs")
    .select("id, filename, approved, parsed_by, flags, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as CvRow[];
}
