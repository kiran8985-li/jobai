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

const OPEN = ["manual", "skipped", "failed", "dry_run", "prepared"];

/** "Mark as applied": the user applied themselves. Only their own, not-yet-sent application changes. */
export async function markApplied(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(form.get("job_id"));
  if (!id.success) redirect("/jobs");
  const e = env();
  if (e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createSupabaseAdminClient();
    const { data: app } = await db.from("applications").select("id, detail").eq("user_id", user.id).eq("job_id", id.data).in("status", OPEN).maybeSingle();
    if (app) {
      const now = new Date().toISOString();
      await db.from("applications").update({ status: "sent", sent_at: now, updated_at: now, detail: { ...(app.detail as object), marked_applied_by_user: true } }).eq("id", app.id).eq("user_id", user.id);
    }
  }
  revalidatePath(`/jobs/${id.data}`);
  revalidatePath("/applications");
  redirect(`/jobs/${id.data}#apply`);
}

/** "Try again" on a skipped or failed application: clears it so the next check looks at the job afresh. */
export async function retryApplication(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(form.get("job_id"));
  if (!id.success) redirect("/jobs");
  const e = env();
  if (e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
    await createSupabaseAdminClient().from("applications").delete().eq("user_id", user.id).eq("job_id", id.data).in("status", ["skipped", "failed"]);
  }
  revalidatePath(`/jobs/${id.data}`);
  revalidatePath("/applications");
  redirect(`/jobs/${id.data}?apply=retry#apply`);
}
