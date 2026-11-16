"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { deleteUserData } from "@/lib/account/data";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DeleteState = { error?: string };

/** Deletes the signed-in user's account and data. They must type their email address to confirm. */
export async function deleteAccount(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const user = await requireUser();
  const typed = String(form.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) return { error: "Type your email address exactly as shown to confirm." };
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return { error: "This is not available right now. Please try again later." };
  const r = await deleteUserData(createSupabaseAdminClient(), user.id, user.email);
  if (!r.ok) {
    return {
      error: r.reason === "last_admin"
        ? "You are the only admin, so this account cannot be deleted. Make another account an admin first."
        : "We could not delete your account just now. Please try again, or contact us.",
    };
  }
  // The account no longer exists; clear the session cookie too.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut().catch(() => {});
  redirect("/?deleted=1");
}

/**
 * Withdraws consent to AI processing. From then on no AI call is made for this user (the AI client
 * checks consent on every call), auto-apply is switched off, and no new CV can be uploaded until
 * consent is given again.
 */
export async function withdrawAiConsent(): Promise<void> {
  const user = await requireUser();
  const e = env();
  if (e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createSupabaseAdminClient();
    await db.from("profiles_user").update({ ai_consent_at: null }).eq("id", user.id);
    await db.from("search_profiles").update({ consent_at: null, auto_apply: false }).eq("user_id", user.id);
  }
  revalidatePath("/", "layout");
  redirect("/account?msg=withdrawn");
}
