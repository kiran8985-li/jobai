import { z } from "zod";
import { normalizeProfile } from "@/lib/cv/types";
import { json, withExtensionUser } from "@/lib/extension/route-helpers";
import { cvFilename } from "@/lib/render/layout";

export const dynamic = "force-dynamic";

/** The tailored CV PDF for one of the user's jobs, as base64, for the extension to attach. */
export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  return withExtensionUser(request, async (db, userId) => {
    const id = z.uuid().safeParse((await ctx.params).jobId);
    if (!id.success) return json({ error: "Not found" }, 404);
    const { data: row } = await db.from("tailored_cvs").select("content_json, pdf_path, jobs(company)").eq("user_id", userId).eq("job_id", id.data).maybeSingle();
    if (!row?.pdf_path) return json({ error: "No tailored CV for this job yet" }, 404);
    const file = await db.storage.from("tailored").download(row.pdf_path);
    if (file.error || !file.data) return json({ error: "Not found" }, 404);
    const company = (row.jobs as unknown as { company: string } | null)?.company;
    return json({
      filename: cvFilename(normalizeProfile(row.content_json), "pdf", company),
      base64: Buffer.from(await file.data.arrayBuffer()).toString("base64"),
    });
  });
}
