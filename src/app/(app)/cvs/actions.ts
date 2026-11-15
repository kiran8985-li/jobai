"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { matchNowFor } from "@/lib/match";
import { approvalProblem, parseProfileForm } from "@/lib/cv/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; notice?: string };

const uuid = z.uuid();

/** Saves edits from the review page. intent=approve also makes it the master CV. */
export async function saveCv(_prev: SaveState, form: FormData): Promise<SaveState> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { error: "CV not found." };
  const parsed = parseProfileForm(String(form.get("profile") ?? ""));
  if ("error" in parsed) return { error: parsed.error };
  const approve = form.get("intent") === "approve";
  if (approve) {
    const problem = approvalProblem(parsed.profile);
    if (problem) return { error: problem };
  }

  const supabase = await createSupabaseServerClient();
  // RLS limits this to the user's own row; user_id is repeated so the intent is explicit.
  const { data, error } = await supabase
    .from("cvs")
    .update({ profile_json: parsed.profile, updated_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .select("id");
  if (error || !data?.length) return { error: "We could not save your CV. Please try again." };

  if (!approve) {
    revalidatePath(`/cvs/${id.data}/review`);
    return { notice: "Saved. It is not used for applications until you approve it." };
  }
  const res = await supabase.rpc("approve_cv", { p_cv: id.data });
  if (res.error) return { error: "We could not approve your CV. Please try again." };
  await matchNowFor(user.id);
  revalidatePath("/cvs");
  // First time through: carry on to job preferences. Afterwards: back to My CVs.
  const { count } = await supabase
    .from("search_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  redirect(count ? "/cvs?approved=1" : "/onboarding/preferences");
}

export async function deleteCv(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("cvs")
    .delete()
    .eq("id", id.data)
    .eq("user_id", user.id)
    .select("storage_path");
  const paths = (data ?? []).map((r) => r.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from("cvs").remove(paths);
  revalidatePath("/cvs");
}
