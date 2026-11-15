"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getMasterCv } from "@/lib/cv/store";
import { CUSTOM_PREFIX, MAX_CUSTOM_ANSWERS, STANDARD_QUESTIONS, isSensitiveQuestion } from "@/lib/screening";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const back = (msg: string) => redirect(`/auto-apply?msg=${msg}`);

/** Records consent for one search. The database sets the timestamp. Does not switch auto-apply on. */
export async function giveApplyConsent(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return back("error");
  if (form.get("consent") !== "on") return back("tick");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("search_profiles")
    .update({ consent_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .is("consent_at", null);
  revalidatePath("/auto-apply");
  back(error ? "error" : "consent_given");
}

/** Withdraws consent. The database turns auto-apply off in the same write. */
export async function withdrawApplyConsent(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return back("error");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("search_profiles")
    .update({ consent_at: null, auto_apply: false })
    .eq("id", id.data)
    .eq("user_id", user.id);
  revalidatePath("/auto-apply");
  back(error ? "error" : "consent_withdrawn");
}

export async function setAutoApply(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return back("error");
  const on = form.get("on") === "true";
  const supabase = await createSupabaseServerClient();

  if (on) {
    const { data: profile } = await supabase
      .from("search_profiles")
      .select("consent_at")
      .eq("id", id.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return back("error");
    if (!profile.consent_at) return back("need_consent");
    if (!(await getMasterCv(supabase, user.id))) return back("need_cv");
  }
  const { data, error } = await supabase
    .from("search_profiles")
    .update({ auto_apply: on })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .select("auto_apply");
  revalidatePath("/auto-apply");
  // The database has the last word: if it kept auto-apply off, say so.
  if (error || !data?.length || data[0].auto_apply !== on) return back(on ? "need_consent" : "error");
  back(on ? "auto_on" : "auto_off");
}

/** Master pause for every search at once. */
export async function setPaused(form: FormData): Promise<void> {
  const user = await requireUser();
  const paused = form.get("paused") === "true";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles_user").update({ auto_apply_paused: paused }).eq("id", user.id);
  revalidatePath("/auto-apply");
  back(error ? "error" : paused ? "paused" : "resumed");
}

export type ScreeningState = { error?: string; notice?: string };

const customSchema = z
  .array(
    z.object({
      question: z.string().trim().max(200, "Keep each question under 200 characters."),
      answer: z.string().trim().max(500, "Keep each answer under 500 characters."),
    }),
  )
  .max(MAX_CUSTOM_ANSWERS, `You can save up to ${MAX_CUSTOM_ANSWERS} extra answers.`);

export async function saveScreening(_prev: ScreeningState, form: FormData): Promise<ScreeningState> {
  const user = await requireUser();
  const wanted = new Map<string, string>();

  for (const q of STANDARD_QUESTIONS) {
    const value = String(form.get(q.key) ?? "").trim().slice(0, 500);
    if (!value) continue;
    if ("options" in q && !q.options.some((o) => o.value === value)) return { error: "Choose one of the listed answers." };
    wanted.set(q.key, value);
  }

  let custom: z.infer<typeof customSchema>;
  try {
    const parsed = customSchema.safeParse(JSON.parse(String(form.get("custom") ?? "[]")));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your extra answers." };
    custom = parsed.data;
  } catch {
    return { error: "The form could not be read. Reload the page and try again." };
  }
  for (const { question, answer } of custom) {
    if (!question && !answer) continue;
    if (!question || !answer) return { error: "Each extra answer needs both a question and an answer." };
    if (isSensitiveQuestion(question)) {
      return {
        error: `We do not store answers about sensitive topics, and we never answer them for you: "${question.slice(0, 80)}". Remove it to save.`,
      };
    }
    wanted.set(CUSTOM_PREFIX + question, answer);
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("screening_answers").select("key").eq("user_id", user.id);
  const stale = (existing ?? []).map((r) => r.key).filter((k) => !wanted.has(k));
  if (stale.length) {
    const { error } = await supabase.from("screening_answers").delete().eq("user_id", user.id).in("key", stale);
    if (error) return { error: "We could not save your answers. Please try again." };
  }
  if (wanted.size) {
    const rows = [...wanted].map(([key, answer]) => ({ user_id: user.id, key, answer, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("screening_answers").upsert(rows, { onConflict: "user_id,key" });
    if (error) return { error: "We could not save your answers. Please try again." };
  }
  revalidatePath("/auto-apply");
  return { notice: "Screening answers saved." };
}
