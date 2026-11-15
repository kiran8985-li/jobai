import { getSessionUser } from "@/lib/auth";
import { getMasterCv } from "@/lib/cv/store";
import { renderCvDocx } from "@/lib/render/docx";
import { fileResponse, isCvFormat, notFound, unauthorized } from "@/lib/render/download";
import { cvFilename } from "@/lib/render/layout";
import { renderCvPdf } from "@/lib/render/pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Downloads the signed-in user's approved master CV in the standard layout. */
export async function GET(_req: Request, ctx: { params: Promise<{ format: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { format } = await ctx.params;
  if (!isCvFormat(format)) return notFound();
  const master = await getMasterCv(await createSupabaseServerClient(), user.id);
  if (!master) return notFound();
  const bytes = format === "pdf" ? await renderCvPdf(master.profile) : await renderCvDocx(master.profile);
  return fileResponse(bytes, format, cvFilename(master.profile, format));
}
