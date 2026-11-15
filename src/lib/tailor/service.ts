import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultAIDeps } from "../ai";
import { getMasterCv } from "../cv/store";
import { env, hasAI } from "../env";
import { renderCvDocx } from "../render/docx";
import { renderCvPdf } from "../render/pdf";
import { createSupabaseAdminClient } from "../supabase/admin";
import { tailorCv } from "./index";

export const MAX_TAILORED_PER_USER_PER_SCAN = 10;
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type TailorOutcome = { ok: true; method: "ai" | "reorder"; flags: string[] } | { ok: false; reason: "no_master_cv" | "no_match" | "no_job" | "failed" };

/**
 * Makes (or remakes) the tailored CV for one user and one job: tailor → fact check → PDF and Word
 * → store. One version per job, so the user can always see exactly what was prepared or sent.
 * `db` must be the service-role client; callers check who is asking.
 */
export async function createTailoredCv(db: SupabaseClient, userId: string, jobId: string, opts: { ai: boolean }): Promise<TailorOutcome> {
  // Only ever the approved master CV.
  const master = await getMasterCv(db, userId);
  if (!master) return { ok: false, reason: "no_master_cv" };
  const { data: job } = await db.from("jobs").select("id, title, company, description").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, reason: "no_job" };
  // Only for jobs that were scored for this user and not filtered out.
  const { data: match } = await db.from("matches").select("id").eq("user_id", userId).eq("job_id", jobId).is("filtered_reason", null).limit(1);
  if (!match?.length) return { ok: false, reason: "no_match" };

  const tailored = await tailorCv(master.profile, job, userId, opts.ai && hasAI(env()) ? defaultAIDeps() : null);
  const [pdf, docx] = await Promise.all([renderCvPdf(tailored.content), renderCvDocx(tailored.content)]);
  const pdfPath = `${userId}/${jobId}.pdf`;
  const docxPath = `${userId}/${jobId}.docx`;
  const up1 = await db.storage.from("tailored").upload(pdfPath, pdf, { contentType: PDF, upsert: true });
  const up2 = await db.storage.from("tailored").upload(docxPath, docx, { contentType: DOCX, upsert: true });
  if (up1.error || up2.error) return { ok: false, reason: "failed" };

  const { error } = await db.from("tailored_cvs").upsert(
    {
      user_id: userId, job_id: jobId, cv_id: master.id, content_json: tailored.content, flags: tailored.flags,
      pdf_path: pdfPath, docx_path: docxPath, method: tailored.method, updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,job_id" },
  );
  if (error) return { ok: false, reason: "failed" };
  return { ok: true, method: tailored.method, flags: tailored.flags };
}

/**
 * Scan stage: tailors a CV for each match at or above the user's minimum that has none yet,
 * best matches first, at most 10 per user per scan. One failure never stops the rest.
 */
export async function tailorPendingMatches(opts: { userId?: string; ai: boolean }): Promise<number> {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return 0;
  const db = createSupabaseAdminClient();
  let q = db
    .from("matches")
    .select("user_id, job_id, score, search_profiles!inner(min_match, is_active)")
    .is("filtered_reason", null)
    .eq("search_profiles.is_active", true)
    .order("score", { ascending: false })
    .limit(2000);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data: matches, error } = await q;
  if (error) throw new Error(error.message);

  const wanted = new Map<string, Set<string>>();
  for (const m of (matches ?? []) as unknown as { user_id: string; job_id: string; score: number; search_profiles: { min_match: number } }[]) {
    if (m.score < m.search_profiles.min_match) continue;
    if (!wanted.has(m.user_id)) wanted.set(m.user_id, new Set());
    wanted.get(m.user_id)!.add(m.job_id);
  }
  let made = 0;
  for (const [userId, jobIds] of wanted) {
    const { data: done } = await db.from("tailored_cvs").select("job_id").eq("user_id", userId).in("job_id", [...jobIds]);
    const have = new Set((done ?? []).map((r) => r.job_id as string));
    for (const jobId of [...jobIds].filter((id) => !have.has(id)).slice(0, MAX_TAILORED_PER_USER_PER_SCAN)) {
      try {
        if ((await createTailoredCv(db, userId, jobId, { ai: opts.ai })).ok) made++;
      } catch (err) {
        // Never log CV contents: the error type only.
        console.error("Tailoring failed for one job:", err instanceof Error ? err.name : "error");
      }
    }
  }
  return made;
}
