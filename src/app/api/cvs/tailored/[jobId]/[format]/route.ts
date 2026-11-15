import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { normalizeProfile } from "@/lib/cv/types";
import { fileResponse, isCvFormat, notFound, unauthorized } from "@/lib/render/download";
import { cvFilename } from "@/lib/render/layout";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Downloads the stored tailored CV for one job. Runs as the signed-in user, so RLS limits it to their own. */
export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string; format: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { jobId, format } = await ctx.params;
  if (!z.uuid().safeParse(jobId).success || !isCvFormat(format)) return notFound();

  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase
    .from("tailored_cvs")
    .select("content_json, pdf_path, docx_path, jobs(company)")
    .eq("user_id", user.id)
    .eq("job_id", jobId)
    .maybeSingle();
  const path = format === "pdf" ? row?.pdf_path : row?.docx_path;
  if (!row || !path) return notFound();
  const file = await supabase.storage.from("tailored").download(path);
  if (file.error || !file.data) return notFound();
  const company = (row.jobs as unknown as { company: string } | null)?.company;
  return fileResponse(await file.data.arrayBuffer(), format, cvFilename(normalizeProfile(row.content_json), format, company));
}
