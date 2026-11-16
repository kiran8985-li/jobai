import { revalidatePath } from "next/cache";
import { z } from "zod";
import { json, withExtensionUser } from "@/lib/extension/route-helpers";

export const dynamic = "force-dynamic";

/** "Mark as applied" from the extension: the user submitted the form themselves. */
export async function POST(request: Request) {
  return withExtensionUser(request, async (db, userId) => {
    const body = (await request.json().catch(() => ({}))) as { jobId?: unknown };
    const id = z.uuid().safeParse(body.jobId);
    if (!id.success) return json({ error: "Choose a job" }, 400);
    // Only jobs scored for this user.
    const { data: match } = await db.from("matches").select("search_profile_id").eq("user_id", userId).eq("job_id", id.data).limit(1);
    if (!match?.length) return json({ error: "Not one of your jobs" }, 404);
    const now = new Date().toISOString();
    const { data: app } = await db.from("applications").select("id, status, detail").eq("user_id", userId).eq("job_id", id.data).maybeSingle();
    if (app?.status === "sent") return json({ ok: true, already: true });
    const detail = { ...((app?.detail as object) ?? {}), marked_applied_by_user: true, via: "browser extension" };
    const res = app
      ? await db.from("applications").update({ status: "sent", sent_at: now, updated_at: now, detail }).eq("id", app.id)
      : await db.from("applications").insert({ user_id: userId, job_id: id.data, search_profile_id: match[0].search_profile_id, status: "sent", method: "ats", sent_at: now, detail });
    if (res.error) return json({ error: "Could not save" }, 500);
    revalidatePath("/applications");
    return json({ ok: true });
  });
}
