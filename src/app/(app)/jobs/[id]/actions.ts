"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createTailoredCv } from "@/lib/tailor/service";

/** "Create a tailored CV" on a job page. Always for the signed-in user; the job id is the only input. */
export async function makeTailoredCv(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(form.get("job_id"));
  if (!id.success) redirect("/jobs");
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) redirect(`/jobs/${id.data}?cv=failed`);
  let outcome: Awaited<ReturnType<typeof createTailoredCv>>;
  try {
    outcome = await createTailoredCv(createSupabaseAdminClient(), user.id, id.data, { ai: true });
  } catch {
    outcome = { ok: false, reason: "failed" };
  }
  revalidatePath(`/jobs/${id.data}`);
  revalidatePath("/cvs");
  redirect(`/jobs/${id.data}?cv=${outcome.ok ? "made" : outcome.reason}#tailored`);
}
