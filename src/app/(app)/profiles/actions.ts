"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MAX_PROFILES, profileFormSchema } from "@/lib/search-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileState = { error?: string; values?: Record<string, string | string[]> };

const uuid = z.uuid();

/** Creates or updates a search profile. Never touches consent or auto-apply. */
export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const text = (k: string) => String(form.get(k) ?? "");
  const raw = {
    name: text("name"),
    roles: text("roles"),
    locations: text("locations"),
    min_salary: text("min_salary"),
    employment_types: form.getAll("employment_types").map(String),
    keywords: text("keywords"),
    exclude_keywords: text("exclude_keywords"),
    min_match: text("min_match"),
    daily_limit: text("daily_limit"),
  };
  const parsed = profileFormSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again.", values: raw };

  const supabase = await createSupabaseServerClient();
  const idRaw = form.get("id");
  if (idRaw) {
    const id = uuid.safeParse(idRaw);
    if (!id.success) return { error: "Search not found.", values: raw };
    const { data, error } = await supabase
      .from("search_profiles")
      .update(parsed.data)
      .eq("id", id.data)
      .eq("user_id", user.id)
      .select("id");
    if (error || !data?.length) return { error: "We could not save this search. Please try again.", values: raw };
  } else {
    const { count } = await supabase
      .from("search_profiles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) >= MAX_PROFILES) {
      return { error: `You can have up to ${MAX_PROFILES} searches. Delete one before adding another.`, values: raw };
    }
    const { error } = await supabase.from("search_profiles").insert({ ...parsed.data, user_id: user.id });
    if (error) return { error: "We could not save this search. Please try again.", values: raw };
  }
  revalidatePath("/profiles");
  redirect(form.get("from") === "onboarding" ? "/auto-apply?welcome=1" : "/profiles?saved=1");
}

export async function setProfileActive(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("search_profiles")
    .update({ is_active: form.get("active") === "true" })
    .eq("id", id.data)
    .eq("user_id", user.id);
  revalidatePath("/profiles");
}

export async function deleteProfile(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("search_profiles").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/profiles");
}
