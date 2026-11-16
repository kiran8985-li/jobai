import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Everything JobPilot AI holds about one person, for "Download my data" (UK GDPR right of access).
 * `db` is the service-role client; every query is filtered to `userId`.
 */
export async function exportUserData(db: SupabaseClient, userId: string, email: string) {
  const own = (table: string, columns = "*") => db.from(table).select(columns).eq("user_id", userId);
  const [profile, cvs, searches, answers, matches, tailored, applications, notifications, ai, invites] = await Promise.all([
    db.from("profiles_user").select("name, is_active, ai_consent_at, auto_apply_paused, created_at").eq("id", userId).maybeSingle(),
    own("cvs", "id, filename, raw_text, profile_json, parsed_by, approved, flags, created_at, updated_at"),
    own("search_profiles", "id, name, roles, locations, min_salary, employment_types, keywords, exclude_keywords, min_match, daily_limit, auto_apply, consent_at, is_active, created_at, updated_at"),
    own("screening_answers", "key, answer, updated_at"),
    own("matches", "score, matching_skills, missing_skills, reasons, filtered_reason, created_at, jobs(title, company, location, apply_url)"),
    own("tailored_cvs", "content_json, flags, method, created_at, updated_at, jobs(title, company)"),
    own("applications", "status, method, detail, created_at, sent_at, jobs(title, company, apply_url)"),
    own("notifications", "kind, message, is_read, created_at"),
    own("ai_usage", "purpose, model, prompt_tokens, completion_tokens, ok, created_at"),
    db.from("invites").select("email, created_at, used_at").eq("email", email.toLowerCase()),
  ]);
  return {
    exported_at: new Date().toISOString(),
    about: "All personal data JobPilot AI holds about you. Original CV files are in your account under My CVs.",
    account: { email, ...(profile.data ?? {}) },
    cvs: cvs.data ?? [],
    job_searches: searches.data ?? [],
    screening_answers: answers.data ?? [],
    matches: matches.data ?? [],
    tailored_cvs: tailored.data ?? [],
    applications: applications.data ?? [],
    notifications: notifications.data ?? [],
    ai_usage: ai.data ?? [],
    invites: invites.data ?? [],
  };
}

/** Removes every file in a user's folder of a private bucket. */
async function emptyFolder(db: SupabaseClient, bucket: string, userId: string) {
  for (let i = 0; i < 50; i++) {
    const { data } = await db.storage.from(bucket).list(userId, { limit: 100 });
    if (!data?.length) return;
    await db.storage.from(bucket).remove(data.map((f) => `${userId}/${f.name}`));
  }
}

export type DeleteResult = { ok: true } | { ok: false; reason: "last_admin" | "failed" };

/**
 * Deletes the account and everything linked to it: files first, then the sign-in account, which
 * removes every row that belongs to it (all user tables reference auth.users with ON DELETE CASCADE).
 * AI usage rows are kept without the user id, so cost totals stay correct but are anonymous.
 */
export async function deleteUserData(db: SupabaseClient, userId: string, email: string): Promise<DeleteResult> {
  const { data: me } = await db.from("profiles_user").select("is_admin").eq("id", userId).maybeSingle();
  if (me?.is_admin) {
    const { count } = await db.from("profiles_user").select("id", { count: "exact", head: true }).eq("is_admin", true).eq("is_active", true);
    if ((count ?? 0) <= 1) return { ok: false, reason: "last_admin" };
  }
  try {
    await emptyFolder(db, "cvs", userId);
    await emptyFolder(db, "tailored", userId);
    await db.from("invites").delete().eq("email", email.toLowerCase());
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) return { ok: false, reason: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
